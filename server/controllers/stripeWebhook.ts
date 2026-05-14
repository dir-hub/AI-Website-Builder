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
    case 'checkout.session.completed':
      const session = event.data.object as Stripe.Checkout.Session;
      const { transactionId, appId } = session.metadata as { transactionId: string, appId: string };
      
      console.log(`[Stripe Webhook] Payment completed for session: ${session.id}`);

      if (appId === 'ai-site-builder' && transactionId) {
        try {
          const transaction = await prisma.transaction.update({
            where: { id: transactionId },
            data: { isPaid: true }
          });

          await prisma.user.update({
            where: { id: transaction.userId },
            data: {
              credits: {
                increment: transaction.credits
              }
            }
          });
          
          console.log(`[Stripe Webhook] Credits added successfully for user: ${transaction.userId}`);
        } catch (dbError) {
          console.error(`[Stripe Webhook] Database update failed:`, dbError);
          return response.status(500).send('Internal Server Error during database update');
        }
      }
      break;
    
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  // Return a response to acknowledge receipt of the event
  response.json({received: true});
}
}