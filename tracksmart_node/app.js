const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/bap_db', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection failed:', err));

// Mongoose Schema for transactions
const transactionSchema = new mongoose.Schema({
  transaction_id: { type: String, required: true },
  message_id: { type: String, required: true },
  action: { type: String, required: true },
  callback_data: { type: Object },
  created_at: { type: Date, default: Date.now }
});
const Transaction = mongoose.model('Transaction', transactionSchema);

// Middleware
app.use(bodyParser.json());

// Generate unique IDs
const generateId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// ========== BECKN BAP Endpoints ==========

// Outbound: BAP -> Gateway/BPP
app.post('/search', async (req, res) => {
  const { start_location, end_location } = req.body;

  // Validate payload
  if (!start_location || !end_location) {
    return res.status(400).json({
      error: 'Missing required fields: start_location, end_location'
    });
  }

  // Generate transaction and message IDs
  const transactionId = generateId('tx');
  const messageId = generateId('msg');

  // Construct Beckn-compliant /search payload
  const searchPayload = {
    context: {
      domain: 'nic2004:60212', // Logistics domain
      country: 'IND',
      city: 'std:080', // Bangalore
      action: 'search',
      core_version: '1.2.0',
      bap_id: 'example-bap.com',
      bap_uri: 'https://example-bap.com/beckn',
      transaction_id: transactionId,
      message_id: messageId,
      timestamp: new Date().toISOString(),
      ttl: 'PT30M'
    },
    message: {
      intent: {
        fulfillment: {
          type: 'Delivery',
          start: {
            location: {
              gps: start_location.gps || undefined, // e.g., "12.9716,77.5946"
              address: start_location.address || undefined // e.g., "No 1, MG Road, Bengaluru, KA"
            }
          },
          end: {
            location: {
              gps: end_location.gps || undefined, // e.g., "12.9352,77.6245"
              address: end_location.address || undefined // e.g., "12, Connaught Place, New Delhi, DL"
            }
          }
        }
      }
    }
  };

  // Store transaction metadata
  try {
    await Transaction.create({
      transaction_id: transactionId,
      message_id: messageId,
      action: 'search'
    });
    console.log('✅ Stored transaction metadata:', transactionId);
  } catch (err) {
    console.error('❌ Error storing transaction:', err);
    return res.status(500).json({ error: 'Failed to store transaction' });
  }

  // Send /search to Gateway or P3's BPP
  try {
    const response = await axios.post('https://example-bpp.com/search', searchPayload, {
      headers: { 'Content-Type': 'application/json' }
    });
    res.json({
      transactionId,
      messageId,
      status: response.data.message.ack.status
    });
  } catch (error) {
    console.error('❌ Error sending /search:', error.message);
    res.status(500).json({ error: 'Failed to search for couriers' });
  }
});

app.post('/select', (req, res) => {
  // TODO: Implement select request to BPP
  res.send('Select request sent');
});

//P1 has triggered the init endpoint to save delivery details
app.post('/init', async (req, res) => {
  const {
    tracking_id,
    shipment_type,
    weight,
    dimensions,
    description,
    pickup,
    delivery,
    carrier,
    service_level
  } = req.body;

  // Validate payload
  if (!pickup || !delivery || !weight || !pickup.address || !delivery.address) {
    return res.status(400).json({
      error: 'Missing required fields: pickup, delivery, weight, or addresses'
    });
  }

  // Generate transaction and message IDs
  const transactionId = generateId('tx');
  const messageId = generateId('msg');

  // Construct Beckn-compliant /init payload
  const initPayload = {
    context: {
      domain: 'nic2004:60212', // Logistics domain
      country: 'IND',
      city: 'std:080', // Bangalore
      action: 'init',
      core_version: '1.2.0',
      bap_id: 'example-bap.com',
      bap_uri: 'https://example-bap.com/beckn',
      bpp_id: carrier || 'example-bpp.com', // Use carrier as bpp_id
      bpp_uri: 'https://example-bpp.com/beckn', // P3's BPP URL
      transaction_id: transactionId,
      message_id: messageId,
      timestamp: new Date().toISOString(),
      ttl: 'PT30M'
    },
    message: {
      order: {
        provider: { id: carrier || 'example-bpp.com' },
        items: [
          {
            id: tracking_id || 'option-1',
            descriptor: { name: service_level || 'Overnight' },
            weight: { value: weight, unit: 'kg' },
            dimensions: dimensions,
            description: description
          }
        ],
        billing: {
          name: pickup.name,
          address: pickup.address,
          phone: pickup.phone
        },
        add_ons:{

        },
        offers:{

        },
        fulfillment: {
          type: 'Delivery',
          tracking: true,
          start: {
            location: { address: pickup.address },
            contact: { name: pickup.name, phone: pickup.phone },
            time: { timestamp: pickup.date }
          },
          end: {
            location: { address: delivery.address },
            contact: { name: delivery.name, phone: delivery.phone },
            time: { timestamp: delivery.expected_date }
          }
        }
      }
    }
  };

  // Store transaction metadata
  try {
    await Transaction.create({
      transaction_id: transactionId,
      message_id: messageId,
      action: 'init'
    });
    console.log('✅ Stored transaction metadata:', transactionId);
  } catch (err) {
    console.error('❌ Error storing transaction:', err);
    return res.status(500).json({ error: 'Failed to store transaction' });
  }

  // Send /init to P3's BPP (or Gateway)
  try {
    const response = await axios.post('https://example-bpp.com/init', initPayload, {
      headers: { 'Content-Type': 'application/json' }
    });
    res.json({
      transactionId,
      messageId,
      status: response.data.message.ack.status
    });
  } catch (error) {
    console.error('❌ Error sending /init:', error.message);
    res.status(500).json({ error: 'Failed to initialize order' });
  }
});

app.post('/confirm', (req, res) => {
  // TODO: Implement confirm request to BPP
  res.send('Confirm request sent');
});

app.post('/track', (req, res) => {
  // TODO: Implement track request to BPP
  res.send('Track request sent');
});

app.post('/cancel', (req, res) => {
  // TODO: Implement cancel request to BPP
  res.send('Cancel request sent');
});

app.post('/support', (req, res) => {
  // TODO: Implement support request to BPP
  res.send('Support request sent');
});

app.post('/rating', (req, res) => {
  // TODO: Implement rating request to BPP
  res.send('Rating request sent');
});

// Inbound: BPP -> BAP (Callbacks)
// Inbound: BPP -> BAP (Callbacks)
app.post('/on_search', async (req, res) => {
  const { context, message } = req.body;

  // Validate callback
  if (!context || !message || context.action !== 'on_search') {
    console.error('❌ Invalid on_search callback');
    return res.status(400).json({ message: { ack: { status: 'NACK' } } });
  }

  // Store callback data
  try {
    await Transaction.updateOne(
      { transaction_id: context.transaction_id, action: 'search' },
      { callback_data: message, created_at: new Date() }
    );
    console.log('✅ Stored on_search callback for transaction:', context.transaction_id);
  } catch (err) {
    console.error('❌ Error storing on_search callback:', err);
    return res.status(500).json({ message: { ack: { status: 'NACK' } } });
  }

  // Respond with ACK
  res.json({ message: { ack: { status: 'ACK' } } });
});

app.post('/on_select', (req, res) => {
  console.log('Received on_select:', req.body);
  res.sendStatus(200);
});

app.post('/on_init', async (req, res) => {
  const { context, message } = req.body;

  // Validate callback
  if (!context || !message || context.action !== 'on_init') {
    console.error('❌ Invalid on_init callback');
    return res.status(400).json({ message: { ack: { status: 'NACK' } } });
  }

  // Store callback data
  try {
    await Transaction.updateOne(
      { transaction_id: context.transaction_id, action: 'init' },
      { callback_data: message, created_at: new Date() }
    );
    console.log('✅ Stored on_init callback for transaction:', context.transaction_id);
  } catch (err) {
    console.error('❌ Error storing on_init callback:', err);
    return res.status(500).json({ message: { ack: { status: 'NACK' } } });
  }

  // Respond with ACK
  res.json({ message: { ack: { status: 'ACK' } } });
});

app.post('/on_confirm', (req, res) => {
  console.log('Received on_confirm:', req.body);
  res.sendStatus(200);
});

app.post('/on_track', (req, res) => {
  console.log('Received on_track:', req.body);
  res.sendStatus(200);
});

app.post('/on_cancel', (req, res) => {
  console.log('Received on_cancel:', req.body);
  res.sendStatus(200);
});

app.post('/on_support', (req, res) => {
  console.log('Received on_support:', req.body);
  res.sendStatus(200);
});

app.post('/on_rating', (req, res) => {
  console.log('Received on_rating:', req.body);
  res.sendStatus(200);
});

// Polling endpoint for P1's frontend
app.get('/api/on_init/:transactionId', async (req, res) => {
  const { transactionId } = req.params;
  try {
    const transaction = await Transaction.findOne({ transaction_id: transactionId, action: 'init' });
    if (!transaction || !transaction.callback_data) {
      return res.status(404).json({ error: 'No results found' });
    }
    res.json({
      context: { transaction_id: transactionId },
      message: transaction.callback_data
    });
  } catch (err) {
    console.error('❌ Error fetching on_init data:', err);
    res.status(500).json({ error: 'Failed to fetch results' });
  }
});

// Root route
app.get('/', (req, res) => {
  res.send('Rohan Pal - TrackSmart BAP is running');
});

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});