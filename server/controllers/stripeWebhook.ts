import { Request, Response } from "express";
import Stripe from "stripe";
import prisma from "../lib/prisma.js";

export const stripeWebhook = async (request: Request, response: Response) => {
    console.log(`[Stripe Webhook] Received request at /api/stripe`);
    console.log(`[Stripe Webhook] Body type: ${typeof request.body}, isBuffer: ${Buffer.isBuffer(request.body)}`);
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY?.trim() as string)
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim() as string
    
    if (!endpointSecret) {
        console.error('[Stripe Webhook] Missing STRIPE_WEBHOOK_SECRET');
        return response.status(400).send('Missing Stripe webhook secret env variable');
    }

    const signature = request.headers['stripe-signature'] as string;
    if (!signature) {
        console.error('[Stripe Webhook] Missing stripe-signature header');
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
      console.error(`[Stripe Webhook] ⚠️ Signature verification failed: ${err.message}`);
      return response.status(400).send(`Webhook Error: ${err.message}`);
    }

  // Handle the event
  console.log(`[Stripe Webhook] Received event type: ${event.type}`);

  const handleSuccessfulPayment = async (metadata: any, sessionId?: string, paymentIntentId?: string) => {
    const transactionId = metadata?.transactionId;
    const appId = metadata?.appId;
    
    console.log(`[Stripe Webhook] Processing payment. transactionId: ${transactionId}, appId: ${appId}, sessionId: ${sessionId}, pi: ${paymentIntentId}`);

    if (appId === 'ai-site-builder' && transactionId) {
      try {
        const transaction = await prisma.transaction.findUnique({
          where: { id: transactionId }
        });

        if (!transaction) {
          console.error(`[Stripe Webhook] Transaction not found: ${transactionId}`);
          return false;
        }

        if (transaction.isPaid) {
          console.log(`[Stripe Webhook] Transaction already processed: ${transactionId}`);
          return true;
        }

        const updatedTransaction = await prisma.transaction.update({
          where: { id: transactionId },
          data: { isPaid: true }
        });

        const updatedUser = await prisma.user.update({
          where: { id: updatedTransaction.userId },
          data: {
            credits: {
              increment: updatedTransaction.credits
            }
          }
        });
        
        console.log(`[Stripe Webhook] Credits added successfully. User: ${updatedUser.id}, Added: ${updatedTransaction.credits}, New Balance: ${updatedUser.credits}`);
        return true;
      } catch (dbError: any) {
        console.error(`[Stripe Webhook] Database update failed:`, dbError.message);
        throw dbError;
      }
    } else {
      console.warn(`[Stripe Webhook] App ID mismatch or missing transactionId. appId: ${appId}, transactionId: ${transactionId}`);
      return false;
    }
  };

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      console.log(`[Stripe Webhook] Session metadata:`, session.metadata);
      await handleSuccessfulPayment(session.metadata, session.id, session.payment_intent as string);
      break;
    }
    
    case 'payment_intent.succeeded': {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      console.log(`[Stripe Webhook] PaymentIntent metadata:`, paymentIntent.metadata);
      await handleSuccessfulPayment(paymentIntent.metadata, undefined, paymentIntent.id);
      break;
    }
    
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  // Return a response to acknowledge receipt of the event
  response.json({received: true});
}