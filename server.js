const bodyParser = require('body-parser')
const crypto = require('crypto')
const dotenv = require('dotenv')
const express = require('express')
const Stripe = require('stripe')
const winston = require('winston')

function handle404 (request, response) {
  response.status(404).send()
}

async function updateStripeTransaction (request, response) {
  const logger = request.app.locals.logger
  logger.info('Processing an incoming request')

  // Validate TypeForm request signature
  if (request.app.locals.verifySignature === 'false') {
    logger.warn('(!!!) Skipping request signature verfication')
  } else {
    const wantSig = request.header('Typeform-Signature')

    if (!wantSig) {
      logger.error('Rejected incoming request: signature header is missing')
      response.status(403).send()
      return
    }

    let haveSig = null

    try {
      haveSig = 'sha256=' + crypto.createHmac('sha256', request.app.locals.webhookSecret).update(request.rawBody).digest('base64')
    } catch (e) {
      logger.error('Rejected incoming request: request body is missing')
      response.status(403).send()
      return
    }

    if (wantSig !== haveSig) {
      logger.error('Rejected incoming request: request signature mismatch')
      response.status(403).send()
      return
    }
  }

  let email = null
  let formId = null
  let formToken = null
  let paymentDetails = null

  try {
    const formResponse = request.body.form_response
    formId = formResponse.form_id
    formToken = formResponse.token

    email = formResponse.answers.find(a => a.type === 'email').email
    paymentDetails = formResponse.answers.find(a => a.type === 'payment').payment
  } catch (e) {
    logger.error('Rejected incoming request: request body is malformed')
    response.status(403).send()
    return
  }

  // Asyncronously respond to TypeForm that the request was received
  response.status(202).send()
  logger.info('Responded to the client: 202 Accepted')

  if (!(paymentDetails && paymentDetails.success === true)) {
    logger.info('Processed incoming request: Payment was not completed by the form submitter -- no action needed')
    response.status(403).send()
    return
  }

  logger.info('Updating a transaction in Stripe')
  const stripe = request.app.locals.stripe

  try {
    // TODO: Limit should be lifted to environment variables
    const charges = await stripe.charges.list({ limit: 5 })
    const targetCharge = charges.data.find(c => (
      c.metadata.typeform_form_id === formId &&
      c.metadata.typeform_response_id === formToken
    ))

    await stripe.charges.update(targetCharge.id, { receipt_email: email })
  } catch (e) {
    // NOTE: We do not log the error because Stripe SDK sometimes decides to leak the API token in the error message
    logger.error('Failed when postprocessing the request: Something terrible has happened when communicating with Stripe')
    response.status(500).send()
  }
}

function main () {
  // Extract and verify all environment configuration
  dotenv.config()

  const listenHost = process.env.LISTEN_HOST
  const listenPort = process.env.LISTEN_PORT
  const verifySignature = process.env.VERIFY_SIGNATURE
  const webhookSecret = process.env.TYPEFORM_WEBHOOK_SECRET
  const stripeApiKey = process.env.STRIPE_LIVE_API_KEY

  if (!(listenHost && listenPort && verifySignature && webhookSecret && stripeApiKey)) {
    console.log('Error: Missing required environment variables to start the server')
    process.exit(1)
  }

  let logLevel = process.env.LOG_LEVEL
  if (!logLevel) {
    logLevel = 'info'
  }

  // Setup logging
  const logFormat = winston.format.printf(({ level, message, _, timestamp }) => {
    return `${timestamp} ${level.toUpperCase()} ${message}`
  })

  const logger = winston.createLogger({
    level: logLevel.toLowerCase(),
    format: winston.format.combine(winston.format.timestamp(), logFormat),
    transports: [new winston.transports.Console()]
  })

  // Initialize an application
  const app = express()
  app.use(bodyParser.json({
    verify: (req, res, buf, encoding) => {
      if (buf && buf.length) {
        req.rawBody = buf.toString(encoding || 'utf8')
      }
    }
  }))

  app.locals.logger = logger
  app.locals.verifySignature = verifySignature
  app.locals.stripe = Stripe(stripeApiKey)
  app.locals.webhookSecret = webhookSecret

  // Setup endpoint handlers
  app.post('/webhook', updateStripeTransaction)
  app.use(handle404)

  app.listen(listenPort, listenHost, () => {
    logger.info(`Running on http://${listenHost}:${listenPort}`)
  })
}

if (require.main === module) {
  main()
}
