import { Request, Response } from "express";
import Stripe from "stripe";
import prisma from "../lib/prisma.js";

export const stripeWebhook = async (request: Request, response: Response) => {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string)
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET as string
    if (!endpointSecret) {
        return response.status(400).send('Missing Stripe webhook secret env variable');
    }


  if (endpointSecret) {
    // Get the signature sent by Stripe
    const signature = request.headers['stripe-signature'] as string;
    if (!signature) {
        return response.status(400).send('Missing Stripe signature header');
    }
      let event;
    try {
      event = stripe.webhooks.constructEvent(
        request.body,
        signature,
        endpointSecret
      );
    } catch (err: any) {
      console.log(`⚠️ Webhook signature verification failed.`, err.message);
      return response.sendStatus(400);
    }

  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      const sessionList = await stripe.checkout.sessions.list({
        payment_intent: paymentIntent.id,
      });
      const session = sessionList.data[0];
      const {transactionId, appId} = session.metadata as {transactionId: string, appId: string };
      if (!session) {
        return response.status(400).send('No session found for payment intent');
      }
      if(appId === 'ai-site-builder' && transactionId) {
        const transaction = await prisma.transaction.update({
          where: {
            id: transactionId
          },
          data: {
            isPaid: true
          }
        });

        await prisma.user.update({
          where: {
            id: transaction.userId
          },
          data: {
            credits: {
              increment: transaction.credits
            }
          }
        });
      }
      break;
    
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  // Return a response to acknowledge receipt of the event
  response.json({received: true});
}
}