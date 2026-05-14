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

  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object as Stripe.Checkout.Session;
      console.log(`[Stripe Webhook] Session metadata:`, session.metadata);

      const transactionId = session.metadata?.transactionId;
      const appId = session.metadata?.appId;
      
      console.log(`[Stripe Webhook] Payment completed for session: ${session.id}, transactionId: ${transactionId}, appId: ${appId}`);

      if (appId === 'ai-site-builder' && transactionId) {
        try {
          const transaction = await prisma.transaction.findUnique({
            where: { id: transactionId }
          });

          if (!transaction) {
            console.error(`[Stripe Webhook] Transaction not found: ${transactionId}`);
            return response.status(404).json({ error: 'Transaction not found' });
          }

          if (transaction.isPaid) {
            console.log(`[Stripe Webhook] Transaction already processed: ${transactionId}`);
            return response.json({ received: true, message: 'Already processed' });
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
        } catch (dbError: any) {
          console.error(`[Stripe Webhook] Database update failed:`, dbError.message);
          return response.status(500).json({ error: 'Database update failed', message: dbError.message });
        }
      } else {
        console.warn(`[Stripe Webhook] App ID mismatch or missing transactionId. appId: ${appId}, transactionId: ${transactionId}`);
      }
      break;
    
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  // Return a response to acknowledge receipt of the event
  response.json({received: true});
}