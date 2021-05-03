TypeForm & Stripe Purchase Receipt Sender
=========================================
# What This Does?
This project is just a verified and opinionated variation of a source code from
[Nicolas Grenié's blog post](https://medium.com/typeforms-engineering-blog/send-a-receipt-after-accepting-payment-on-a-typeform-175e5261404d).
Read the original blog post to understand what this does.

A somewhat crude explanation:
1. Somebody submits TypeForm form which contains Stripe integration (and pays for something during submission)
2. TypeForm triggers this webhook
3. This server updates a matching Stripe transaction with an email of the form submitter
4. Stripe automatically triggers an email with a purchase receipt that is send to the submitter
5. Profit

# Quick Start
```
# Fill in required environment variables
cp .env.example .env
vim .env

# Install application dependencies and run the server
npm install
npm start
```
