const express = require('express');
const Stripe = require('stripe');

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

router.post('/create-subscription', async (req, res) => {
  try {
    const { plan, customerId } = req.body;
    
    const paymentIntent = await stripe.paymentIntents.create({
      amount: plan === 'pro' ? 2900 : 9900,
      currency: 'usd',
      customer: customerId,
      metadata: { plan },
      automatic_payment_methods: { enabled: true },
    });

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;