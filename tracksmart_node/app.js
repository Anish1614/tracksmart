const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3050;

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

app.post('/select', async (req, res) => {
    const { order } = req.body;

    // Validate payload
    if (!order || !order.provider || !order.provider.id || !order.items || !order.items.length || !order.fulfillment) {
        return res.status(400).json({
            error: { code: '4000', message: 'Missing required fields: order.provider.id, order.items, order.fulfillment' }
        });
    }

    // Generate transaction and message IDs
    const transactionId = generateId('tx');
    const messageId = generateId('msg');

    // Construct Beckn-compliant /select payload
    const selectPayload = {
        context: {
            domain: 'nic2004:60212',
            country: 'IND',
            city: 'std:080',
            action: 'select',
            core_version: '1.2.0',
            bap_id: 'example-bap.com',
            bap_uri: 'https://example-bap.com/beckn',
            bpp_id: order.provider.id,
            bpp_uri: 'https://example-bpp.com/beckn',
            transaction_id: transactionId,
            message_id: messageId,
            timestamp: new Date().toISOString(),
            ttl: 'PT30M'
        },
        message: {
            order: {
                provider: { id: order.provider.id },
                items: order.items.map(item => ({
                    id: item.id,
                    descriptor: item.descriptor || { name: item.name || 'Unknown' }
                })),
                add_ons: order.add_ons || [], // Optional add-ons (e.g., insurance, priority handling)
                offers: order.offers || [], // Optional offers (e.g., discounts)
                fulfillment: {
                    type: 'Delivery',
                    start: order.fulfillment.start ? {
                        location: order.fulfillment.start.location,
                        contact: order.fulfillment.start.contact,
                        time: order.fulfillment.start.time
                    } : undefined,
                    end: order.fulfillment.end ? {
                        location: order.fulfillment.end.location,
                        contact: order.fulfillment.end.contact,
                        time: order.fulfillment.end.time
                    } : undefined
                }
            }
        }
    };

    // Store transaction metadata
    try {
        await Transaction.create({
            transaction_id: transactionId,
            message_id: messageId,
            action: 'select'
        });
        console.log('✅ Stored transaction metadata:', transactionId);
    } catch (err) {
        console.error('❌ Error storing transaction:', err);
        return res.status(500).json({ error: { code: '5000', message: 'Failed to store transaction' } });
    }

    // Send /select to P3's BPP
    try {
        const response = await axios.post('https://example-bpp.com/select', selectPayload, {
            headers: { 'Content-Type': 'application/json' }
        });
        if (!response.data.message?.ack?.status) {
            throw new Error('Invalid ACK response');
        }
        res.json({
            context: { transaction_id: transactionId, message_id: messageId },
            message: { ack: { status: response.data.message.ack.status } }
        });
    } catch (error) {
        console.error('❌ Error sending /select:', error.message);
        res.status(500).json({ error: { code: '5000', message: 'Failed to select courier' } });
    }
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
            bap_id: 'logistics-bap.tracksmart.in',
            bap_uri: 'http://98.84.49.228:5002',
            bpp_id: 'logistics-bpp.tracksmart.in', // Use carrier as bpp_id
            bpp_uri: 'http://44.213.100.33:6002', // P3's BPP URL
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
                add_ons: {

                },
                offers: {

                },
                fulfillment: {
                    type: 'Delivery',
                    tracking: true,
                    start: {
                        location: { address: pickup.address },
                        contact: {  name: pickup.name, phone: pickup.phone },
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
        const response = await axios.post('http://44.213.100.33:6002/init', initPayload, {
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

app.post('/confirm', async (req, res) => {
    const { order } = req.body;

    // Validate payload
    if (!order || !order.id || !order.provider || !order.provider.id || !order.items || !order.items.length || !order.billing || !order.fulfillment) {
        return res.status(400).json({
            error: { code: '4000', message: 'Missing required fields: order.id, order.provider.id, order.items, order.billing, order.fulfillment' }
        });
    }

    // Generate transaction and message IDs
    const transactionId = generateId('tx');
    const messageId = generateId('msg');

    // Construct Beckn-compliant /confirm payload
    const confirmPayload = {
        context: {
            domain: 'nic2004:60212',
            country: 'IND',
            city: 'std:080',
            action: 'confirm',
            core_version: '1.2.0',
            bap_id: 'example-bap.com',
            bap_uri: 'https://example-bap.com/beckn',
            bpp_id: order.provider.id,
            bpp_uri: 'https://example-bpp.com/beckn',
            transaction_id: transactionId,
            message_id: messageId,
            timestamp: new Date().toISOString(),
            ttl: 'PT30M'
        },
        message: {
            order: {
                id: order.id,
                provider: {
                    id: order.provider.id,
                    descriptor: order.provider.descriptor || undefined
                },
                items: order.items.map(item => ({
                    id: item.id,
                    descriptor: item.descriptor || { name: item.name || 'Unknown' },
                    weight: item.weight || undefined,
                    dimensions: item.dimensions || undefined
                })),
                billing: {
                    name: order.billing.name,
                    address: order.billing.address,
                    phone: order.billing.phone,
                    email: order.billing.email || undefined,
                    tax_id: order.billing.tax_id || undefined
                },
                fulfillment: {
                    type: 'Delivery',
                    tracking: order.fulfillment.tracking || true,
                    start: order.fulfillment.start ? {
                        location: order.fulfillment.start.location,
                        contact: order.fulfillment.start.contact,
                        time: order.fulfillment.start.time
                    } : undefined,
                    end: order.fulfillment.end ? {
                        location: order.fulfillment.end.location,
                        contact: order.fulfillment.end.contact,
                        time: order.fulfillment.end.time
                    } : undefined
                },
                payment: order.payment || { type: 'ON-FULFILLMENT', collected_by: 'BPP' },
                add_ons: order.add_ons || [],
                offers: order.offers || []
            }
        }
    };

    // Store transaction metadata
    try {
        await Transaction.create({
            transaction_id: transactionId,
            message_id: messageId,
            action: 'confirm'
        });
        console.log('✅ Stored transaction metadata:', transactionId);
    } catch (err) {
        console.error('❌ Error storing transaction:', err);
        return res.status(500).json({ error: { code: '5000', message: 'Failed to store transaction' } });
    }

    // Send /confirm to P3's BPP
    try {
        const response = await axios.post('https://example-bpp.com/confirm', confirmPayload, {
            headers: { 'Content-Type': 'application/json' }
        });
        if (!response.data.message?.ack?.status) {
            throw new Error('Invalid ACK response');
        }
        res.json({
            context: { transaction_id: transactionId, message_id: messageId },
            message: { ack: { status: response.data.message.ack.status } }
        });
    } catch (error) {
        console.error('❌ Error sending /confirm:', error.message);
        res.status(500).json({ error: { code: '5000', message: 'Failed to confirm order' } });
    }
});

app.post('/track', async (req, res) => {
    const { order_id, callback_url } = req.body;

    // Validate payload
    if (!order_id) {
        return res.status(400).json({
            error: { code: '4000', message: 'Missing required field: order_id' }
        });
    }

    // Generate transaction and message IDs
    const transactionId = generateId('tx');
    const messageId = generateId('msg');

    // Construct Beckn-compliant /track payload
    const trackPayload = {
        context: {
            domain: 'nic2004:60212',
            country: 'IND',
            city: 'std:080',
            action: 'track',
            core_version: '1.2.0',
            bap_id: 'example-bap.com',
            bap_uri: 'https://example-bap.com/beckn',
            bpp_id: 'example-bpp.com',
            bpp_uri: 'https://example-bpp.com/beckn',
            transaction_id: transactionId,
            message_id: messageId,
            timestamp: new Date().toISOString(),
            ttl: 'PT30M'
        },
        message: {
            order_id,
            callback_url: callback_url || 'https://example-bap.com/beckn/on_track'
        }
    };

    // Store transaction metadata
    try {
        await Transaction.create({
            transaction_id: transactionId,
            message_id: messageId,
            action: 'track'
        });
        console.log('✅ Stored transaction metadata:', transactionId);
    } catch (err) {
        console.error('❌ Error storing transaction:', err);
        return res.status(500).json({ error: { code: '5000', message: 'Failed to store transaction' } });
    }

    // Send /track to P3's BPP
    try {
        const response = await axios.post('https://example-bpp.com/track', trackPayload, {
            headers: { 'Content-Type': 'application/json' }
        });
        if (!response.data.message?.ack?.status) {
            throw new Error('Invalid ACK response');
        }
        res.json({
            context: { transaction_id: transactionId, message_id: messageId },
            message: { ack: { status: response.data.message.ack.status } }
        });
    } catch (error) {
        console.error('❌ Error sending /track:', error.message);
        res.status(500).json({ error: { code: '5000', message: 'Failed to track order' } });
    }
});

app.post('/cancel', async (req, res) => {
    const { order_id, cancellation_reason_id, descriptor } = req.body;

    // Validate payload
    if (!order_id || !cancellation_reason_id) {
        return res.status(400).json({
            error: { code: '4000', message: 'Missing required fields: order_id, cancellation_reason_id' }
        });
    }

    // Generate transaction and message IDs
    const transactionId = generateId('tx');
    const messageId = generateId('msg');

    // Construct Beckn-compliant /cancel payload
    const cancelPayload = {
        context: {
            domain: 'nic2004:60212',
            country: 'IND',
            city: 'std:080',
            action: 'cancel',
            core_version: '1.2.0',
            bap_id: 'example-bap.com',
            bap_uri: 'https://example-bap.com/beckn',
            bpp_id: 'example-bpp.com',
            bpp_uri: 'https://example-bpp.com/beckn',
            transaction_id: transactionId,
            message_id: messageId,
            timestamp: new Date().toISOString(),
            ttl: 'PT30M'
        },
        message: {
            order_id,
            cancellation_reason_id,
            descriptor: descriptor || { name: 'Customer cancellation' }
        }
    };

    // Store transaction metadata
    try {
        await Transaction.create({
            transaction_id: transactionId,
            message_id: messageId,
            action: 'cancel'
        });
        console.log('✅ Stored transaction metadata:', transactionId);
    } catch (err) {
        console.error('❌ Error storing transaction:', err);
        return res.status(500).json({ error: { code: '5000', message: 'Failed to store transaction' } });
    }

    // Send /cancel to P3's BPP
    try {
        const response = await axios.post('https://example-bpp.com/cancel', cancelPayload, {
            headers: { 'Content-Type': 'application/json' }
        });
        if (!response.data.message?.ack?.status) {
            throw new Error('Invalid ACK response');
        }
        res.json({
            context: { transaction_id: transactionId, message_id: messageId },
            message: { ack: { status: response.data.message.ack.status } }
        });
    } catch (error) {
        console.error('❌ Error sending /cancel:', error.message);
        res.status(500).json({ error: { code: '5000', message: 'Failed to cancel order' } });
    }
});

app.post('/support', async (req, res) => {
    const { ref_id } = req.body;

    // Validate payload
    if (!ref_id) {
        return res.status(400).json({
            error: { code: '4000', message: 'Missing required field: ref_id' }
        });
    }

    // Generate transaction and message IDs
    const transactionId = generateId('tx');
    const messageId = generateId('msg');

    // Construct Beckn-compliant /support payload
    const supportPayload = {
        context: {
            domain: 'nic2004:60212',
            country: 'IND',
            city: 'std:080',
            action: 'support',
            core_version: '1.2.0',
            bap_id: 'example-bap.com',
            bap_uri: 'https://example-bap.com/beckn',
            bpp_id: 'example-bpp.com',
            bpp_uri: 'https://example-bpp.com/beckn',
            transaction_id: transactionId,
            message_id: messageId,
            timestamp: new Date().toISOString(),
            ttl: 'PT30M'
        },
        message: {
            ref_id
        }
    };

    // Store transaction metadata
    try {
        await Transaction.create({
            transaction_id: transactionId,
            message_id: messageId,
            action: 'support'
        });
        console.log('✅ Stored transaction metadata:', transactionId);
    } catch (err) {
        console.error('❌ Error storing transaction:', err);
        return res.status(500).json({ error: { code: '5000', message: 'Failed to store transaction' } });
    }

    // Send /support to P3's BPP
    try {
        const response = await axios.post('https://example-bpp.com/support', supportPayload, {
            headers: { 'Content-Type': 'application/json' }
        });
        if (!response.data.message?.ack?.status) {
            throw new Error('Invalid ACK response');
        }
        res.json({
            context: { transaction_id: transactionId, message_id: messageId },
            message: { ack: { status: response.data.message.ack.status } }
        });
    } catch (error) {
        console.error('❌ Error sending /support:', error.message);
        res.status(500).json({ error: { code: '5000', message: 'Failed to request support' } });
    }
});

app.post('/rating', async (req, res) => {
    const { ratings } = req.body;

    // Validate payload
    if (!ratings || !Array.isArray(ratings) || !ratings.length || !ratings[0]?.id || !ratings[0]?.value) {
        return res.status(400).json({
            error: { code: '4000', message: 'Missing required fields: ratings.id, ratings.value' }
        });
    }

    // Generate transaction and message IDs
    const transactionId = generateId('tx');
    const messageId = generateId('msg');

    // Construct Beckn-compliant /rating payload
    const ratingPayload = {
        context: {
            domain: 'nic2004:60212',
            country: 'IND',
            city: 'std:080',
            action: 'rating',
            core_version: '1.2.0',
            bap_id: 'example-bap.com',
            bap_uri: 'https://example-bap.com/beckn',
            bpp_id: 'example-bpp.com',
            bpp_uri: 'https://example-bpp.com/beckn',
            transaction_id: transactionId,
            message_id: messageId,
            timestamp: new Date().toISOString(),
            ttl: 'PT30M'
        },
        message: {
            ratings: ratings.map(rating => ({
                id: rating.id,
                value: rating.value
            }))
        }
    };

    // Store transaction metadata
    try {
        await Transaction.create({
            transaction_id: transactionId,
            message_id: messageId,
            action: 'rating'
        });
        console.log('✅ Stored transaction metadata:', transactionId);
    } catch (err) {
        console.error('❌ Error storing transaction:', err);
        return res.status(500).json({ error: { code: '5000', message: 'Failed to store transaction' } });
    }

    // Send /rating to P3's BPP
    try {
        const response = await axios.post('https://example-bpp.com/rating', ratingPayload, {
            headers: { 'Content-Type': 'application/json' }
        });
        if (!response.data.message?.ack?.status) {
            throw new Error('Invalid ACK response');
        }
        res.json({
            context: { transaction_id: transactionId, message_id: messageId },
            message: { ack: { status: response.data.message.ack.status } }
        });
    } catch (error) {
        console.error('❌ Error sending /rating:', error.message);
        res.status(500).json({ error: { code: '5000', message: 'Failed to submit rating' } });
    }
});

app.post('/status', async (req, res) => {
    const { order_id } = req.body;

    // Validate payload
    if (!order_id) {
        return res.status(400).json({
            error: { code: '4000', message: 'Missing required field: order_id' }
        });
    }

    // Generate transaction and message IDs
    const transactionId = generateId('tx');
    const messageId = generateId('msg');

    // Construct Beckn-compliant /status payload
    const statusPayload = {
        context: {
            domain: 'nic2004:60212',
            country: 'IND',
            city: 'std:080',
            action: 'status',
            core_version: '1.2.0',
            bap_id: 'example-bap.com',
            bap_uri: 'https://example-bap.com/beckn',
            bpp_id: 'example-bpp.com',
            bpp_uri: 'https://example-bpp.com/beckn',
            transaction_id: transactionId,
            message_id: messageId,
            timestamp: new Date().toISOString(),
            ttl: 'PT30M'
        },
        message: {
            order_id
        }
    };

    // Store transaction metadata
    try {
        await Transaction.create({
            transaction_id: transactionId,
            message_id: messageId,
            action: 'status'
        });
        console.log('✅ Stored transaction metadata:', transactionId);
    } catch (err) {
        console.error('❌ Error storing transaction:', err);
        return res.status(500).json({ error: { code: '5000', message: 'Failed to store transaction' } });
    }

    // Send /status to P3's BPP
    try {
        const response = await axios.post('https://example-bpp.com/status', statusPayload, {
            headers: { 'Content-Type': 'application/json' }
        });
        if (!response.data.message?.ack?.status) {
            throw new Error('Invalid ACK response');
        }
        res.json({
            context: { transaction_id: transactionId, message_id: messageId },
            message: { ack: { status: response.data.message.ack.status } }
        });
    } catch (error) {
        console.error('❌ Error sending /status:', error.message);
        res.status(500).json({ error: { code: '5000', message: 'Failed to request status' } });
    }
});

app.post('/update', async (req, res) => {
    const { update_target, order } = req.body;

    // Validate payload
    if (!update_target || !order || !order.id) {
        return res.status(400).json({
            error: { code: '4000', message: 'Missing required fields: update_target, order.id' }
        });
    }

    // Generate transaction and message IDs
    const transactionId = generateId('tx');
    const messageId = generateId('msg');

    // Construct Beckn-compliant /update payload
    const updatePayload = {
        context: {
            domain: 'nic2004:60212',
            country: 'IND',
            city: 'std:080',
            action: 'update',
            core_version: '1.2.0',
            bap_id: 'example-bap.com',
            bap_uri: 'https://example-bap.com/beckn',
            bpp_id: order.provider?.id || 'example-bpp.com',
            bpp_uri: 'https://example-bpp.com/beckn',
            transaction_id: transactionId,
            message_id: messageId,
            timestamp: new Date().toISOString(),
            ttl: 'PT30M'
        },
        message: {
            update_target,
            order: {
                id: order.id,
                provider: order.provider ? {
                    id: order.provider.id,
                    descriptor: order.provider.descriptor || undefined
                } : undefined,
                items: order.items?.map(item => ({
                    id: item.id,
                    descriptor: item.descriptor || { name: item.name || 'Unknown' },
                    weight: item.weight || undefined,
                    dimensions: item.dimensions || undefined
                })) || undefined,
                billing: order.billing ? {
                    name: order.billing.name,
                    address: order.billing.address,
                    phone: order.billing.phone,
                    email: order.billing.email || undefined,
                    tax_id: order.billing.tax_id || undefined
                } : undefined,
                fulfillment: order.fulfillment ? {
                    type: 'Delivery',
                    tracking: order.fulfillment.tracking || true,
                    start: order.fulfillment.start ? {
                        location: order.fulfillment.start.location,
                        contact: order.fulfillment.start.contact,
                        time: order.fulfillment.start.time
                    } : undefined,
                    end: order.fulfillment.end ? {
                        location: order.fulfillment.end.location,
                        contact: order.fulfillment.end.contact,
                        time: order.fulfillment.end.time
                    } : undefined
                } : undefined,
                payment: order.payment || undefined,
                add_ons: order.add_ons || [],
                offers: order.offers || []
            }
        }
    };

    // Store transaction metadata
    try {
        await Transaction.create({
            transaction_id: transactionId,
            message_id: messageId,
            action: 'update'
        });
        console.log('✅ Stored transaction metadata:', transactionId);
    } catch (err) {
        console.error('❌ Error storing transaction:', err);
        return res.status(500).json({ error: { code: '5000', message: 'Failed to store transaction' } });
    }

    // Send /update to P3's BPP
    try {
        const response = await axios.post('https://example-bpp.com/update', updatePayload, {
            headers: { 'Content-Type': 'application/json' }
        });
        if (!response.data.message?.ack?.status) {
            throw new Error('Invalid ACK response');
        }
        res.json({
            context: { transaction_id: transactionId, message_id: messageId },
            message: { ack: { status: response.data.message.ack.status } }
        });
    } catch (error) {
        console.error('❌ Error sending /update:', error.message);
        res.status(500).json({ error: { code: '5000', message: 'Failed to update order' } });
    }
});

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

app.post('/on_select', async (req, res) => {
    const { context, message } = req.body;

    // Validate callback
    if (!validateContext(context, 'on_select') || !message.order || !message.order.provider || !message.order.items) {
        console.error('❌ Invalid on_select callback');
        return res.status(400).json({ message: { ack: { status: 'NACK' } } });
    }

    // Store callback data
    try {
        await Transaction.updateOne(
            { transaction_id: context.transaction_id, action: 'select' },
            { callback_data: message, created_at: new Date() }
        );
        console.log('✅ Stored on_select callback for transaction:', context.transaction_id);
    } catch (err) {
        console.error('❌ Error storing on_select callback:', err);
        return res.status(500).json({ message: { ack: { status: 'NACK' } } });
    }

    // Respond with ACK
    res.json({ message: { ack: { status: 'ACK' } } });
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

app.post('/on_confirm', async (req, res) => {
    const { context, message } = req.body;

    // Validate callback
    if (!validateContext(context, 'on_confirm') || !message.order || !message.order.id || !message.order.provider || !message.order.items) {
        console.error('❌ Invalid on_confirm callback');
        return res.status(400).json({ message: { ack: { status: 'NACK' } } });
    }

    // Store callback data
    try {
        await Transaction.updateOne(
            { transaction_id: context.transaction_id, action: 'confirm' },
            { callback_data: message, created_at: new Date() }
        );
        console.log('✅ Stored on_confirm callback for transaction:', context.transaction_id);
    } catch (err) {
        console.error('❌ Error storing on_confirm callback:', err);
        return res.status(500).json({ message: { ack: { status: 'NACK' } } });
    }

    // Respond with ACK
    res.json({ message: { ack: { status: 'ACK' } } });
});

app.post('/on_track', async (req, res) => {
    const { context, message } = req.body;

    // Validate callback
    if (!validateContext(context, 'on_track') || !message.tracking) {
        console.error('❌ Invalid on_track callback');
        return res.status(400).json({ message: { ack: { status: 'NACK' } } });
    }

    // Store callback data
    try {
        await Transaction.updateOne(
            { transaction_id: context.transaction_id, action: 'track' },
            { callback_data: message, created_at: new Date() }
        );
        console.log('✅ Stored on_track callback for transaction:', context.transaction_id);
    } catch (err) {
        console.error('❌ Error storing on_track callback:', err);
        return res.status(500).json({ message: { ack: { status: 'NACK' } } });
    }

    // Respond with ACK
    res.json({ message: { ack: { status: 'ACK' } } });
});

app.post('/on_cancel', async (req, res) => {
    const { context, message } = req.body;

    // Validate callback
    if (!validateContext(context, 'on_cancel') || !message.order || !message.order.id) {
        console.error('❌ Invalid on_cancel callback');
        return res.status(400).json({ message: { ack: { status: 'NACK' } } });
    }

    // Store callback data
    try {
        await Transaction.updateOne(
            { transaction_id: context.transaction_id, action: 'cancel' },
            { callback_data: message, created_at: new Date() }
        );
        console.log('✅ Stored on_cancel callback for transaction:', context.transaction_id);
    } catch (err) {
        console.error('❌ Error storing on_cancel callback:', err);
        return res.status(500).json({ message: { ack: { status: 'NACK' } } });
    }

    // Respond with ACK
    res.json({ message: { ack: { status: 'ACK' } } });
});

app.post('/on_support', async (req, res) => {
    const { context, message } = req.body;

    // Validate callback
    if (!validateContext(context, 'on_support') || !message.contact) {
        console.error('❌ Invalid on_support callback');
        return res.status(400).json({ message: { ack: { status: 'NACK' } } });
    }

    // Store callback data
    try {
        await Transaction.updateOne(
            { transaction_id: context.transaction_id, action: 'support' },
            { callback_data: message, created_at: new Date() }
        );
        console.log('✅ Stored on_support callback for transaction:', context.transaction_id);
    } catch (err) {
        console.error('❌ Error storing on_support callback:', err);
        return res.status(500).json({ message: { ack: { status: 'NACK' } } });
    }

    // Respond with ACK
    res.json({ message: { ack: { status: 'ACK' } } });
});

app.post('/on_rating', async (req, res) => {
    const { context, message } = req.body;

    // Validate callback
    if (!validateContext(context, 'on_rating') || !message.feedback) {
        console.error('❌ Invalid on_rating callback');
        return res.status(400).json({ message: { ack: { status: 'NACK' } } });
    }

    // Store callback data
    try {
        await Transaction.updateOne(
            { transaction_id: context.transaction_id, action: 'rating' },
            { callback_data: message, created_at: new Date() }
        );
        console.log('✅ Stored on_rating callback for transaction:', context.transaction_id);
    } catch (err) {
        console.error('❌ Error storing on_rating callback:', err);
        return res.status(500).json({ message: { ack: { status: 'NACK' } } });
    }

    // Respond with ACK
    res.json({ message: { ack: { status: 'ACK' } } });
});

app.post('/on_status', async (req, res) => {
    const { context, message } = req.body;

    // Validate callback
    if (!validateContext(context, 'on_status') || !message.order || !message.order.id) {
        console.error('❌ Invalid on_status callback');
        return res.status(400).json({ message: { ack: { status: 'NACK' } } });
    }

    // Store callback data
    try {
        await Transaction.updateOne(
            { transaction_id: context.transaction_id, action: 'status' },
            { callback_data: message, created_at: new Date() }
        );
        console.log('✅ Stored on_status callback for transaction:', context.transaction_id);
    } catch (err) {
        console.error('❌ Error storing on_status callback:', err);
        return res.status(500).json({ message: { ack: { status: 'NACK' } } });
    }

    // Respond with ACK
    res.json({ message: { ack: { status: 'ACK' } } });
});

app.post('/on_update', async (req, res) => {
    const { context, message } = req.body;

    // Validate callback
    if (!validateContext(context, 'on_update') || !message.order || !message.order.id) {
        console.error('❌ Invalid on_update callback');
        return res.status(400).json({ message: { ack: { status: 'NACK' } } });
    }

    // Store callback data
    try {
        await Transaction.updateOne(
            { transaction_id: context.transaction_id, action: 'update' },
            { callback_data: message, created_at: new Date() }
        );
        console.log('✅ Stored on_update callback for transaction:', context.transaction_id);
    } catch (err) {
        console.error('❌ Error storing on_update callback:', err);
        return res.status(500).json({ message: { ack: { status: 'NACK' } } });
    }

    // Respond with ACK
    res.json({ message: { ack: { status: 'ACK' } } });
});

// Polling endpoint for P1's frontend
app.get('/api/on_search/:transactionId', async (req, res) => {
    const { transactionId } = req.params;
    try {
        const transaction = await Transaction.findOne({ transaction_id: transactionId, action: 'search' });
        if (!transaction || !transaction.callback_data) {
            return res.status(404).json({ error: 'No results found' });
        }
        res.json({
            context: { transaction_id: transactionId },
            message: transaction.callback_data
        });
    } catch (err) {
        console.error('❌ Error fetching on_search data:', err);
        res.status(500).json({ error: 'Failed to fetch results' });
    }
});

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

app.get('/api/on_select/:transactionId', async (req, res) => {
    const { transactionId } = req.params;
    try {
        const transaction = await Transaction.findOne({ transaction_id: transactionId, action: 'select' });
        if (!transaction || !transaction.callback_data) {
            return res.status(404).json({ error: { code: '4040', message: 'No results found' } });
        }
        res.json({
            context: { transaction_id: transactionId },
            message: transaction.callback_data
        });
    } catch (err) {
        console.error('❌ Error fetching on_select data:', err);
        res.status(500).json({ error: { code: '5000', message: 'Failed to fetch results' } });
    }
});

app.get('/api/on_confirm/:transactionId', async (req, res) => {
    const { transactionId } = req.params;
    try {
        const transaction = await Transaction.findOne({ transaction_id: transactionId, action: 'confirm' });
        if (!transaction || !transaction.callback_data) {
            return res.status(404).json({ error: { code: '4040', message: 'No results found' } });
        }
        res.json({
            context: { transaction_id: transactionId },
            message: transaction.callback_data
        });
    } catch (err) {
        console.error('❌ Error fetching on_confirm data:', err);
        res.status(500).json({ error: { code: '5000', message: 'Failed to fetch results' } });
    }
});

app.get('/api/on_track/:transactionId', async (req, res) => {
    const { transactionId } = req.params;
    try {
        const transaction = await Transaction.findOne({ transaction_id: transactionId, action: 'track' });
        if (!transaction || !transaction.callback_data) {
            return res.status(404).json({ error: { code: '4040', message: 'No results found' } });
        }
        res.json({
            context: { transaction_id: transactionId },
            message: transaction.callback_data
        });
    } catch (err) {
        console.error('❌ Error fetching on_track data:', err);
        res.status(500).json({ error: { code: '5000', message: 'Failed to fetch results' } });
    }
});

app.get('/api/on_cancel/:transactionId', async (req, res) => {
    const { transactionId } = req.params;
    try {
        const transaction = await Transaction.findOne({ transaction_id: transactionId, action: 'cancel' });
        if (!transaction || !transaction.callback_data) {
            return res.status(404).json({ error: { code: '4040', message: 'No results found' } });
        }
        res.json({
            context: { transaction_id: transactionId },
            message: transaction.callback_data
        });
    } catch (err) {
        console.error('❌ Error fetching on_cancel data:', err);
        res.status(500).json({ error: { code: '5000', message: 'Failed to fetch results' } });
    }
});

app.get('/api/on_support/:transactionId', async (req, res) => {
    const { transactionId } = req.params;
    try {
        const transaction = await Transaction.findOne({ transaction_id: transactionId, action: 'support' });
        if (!transaction || !transaction.callback_data) {
            return res.status(404).json({ error: { code: '4040', message: 'No results found' } });
        }
        res.json({
            context: { transaction_id: transactionId },
            message: transaction.callback_data
        });
    } catch (err) {
        console.error('❌ Error fetching on_support data:', err);
        res.status(500).json({ error: { code: '5000', message: 'Failed to fetch results' } });
    }
});

app.get('/api/on_rating/:transactionId', async (req, res) => {
    const { transactionId } = req.params;
    try {
        const transaction = await Transaction.findOne({ transaction_id: transactionId, action: 'rating' });
        if (!transaction || !transaction.callback_data) {
            return res.status(404).json({ error: { code: '4040', message: 'No results found' } });
        }
        res.json({
            context: { transaction_id: transactionId },
            message: transaction.callback_data
        });
    } catch (err) {
        console.error('❌ Error fetching on_rating data:', err);
        res.status(500).json({ error: { code: '5000', message: 'Failed to fetch results' } });
    }
});

app.get('/api/on_status/:transactionId', async (req, res) => {
    const { transactionId } = req.params;
    try {
        const transaction = await Transaction.findOne({ transaction_id: transactionId, action: 'status' });
        if (!transaction || !transaction.callback_data) {
            return res.status(404).json({ error: { code: '4040', message: 'No results found' } });
        }
        res.json({
            context: { transaction_id: transactionId },
            message: transaction.callback_data
        });
    } catch (err) {
        console.error('❌ Error fetching on_status data:', err);
        res.status(500).json({ error: { code: '5000', message: 'Failed to fetch results' } });
    }
});

app.get('/api/on_update/:transactionId', async (req, res) => {
    const { transactionId } = req.params;
    try {
        const transaction = await Transaction.findOne({ transaction_id: transactionId, action: 'update' });
        if (!transaction || !transaction.callback_data) {
            return res.status(404).json({ error: { code: '4040', message: 'No results found' } });
        }
        res.json({
            context: { transaction_id: transactionId },
            message: transaction.callback_data
        });
    } catch (err) {
        console.error('❌ Error fetching on_update data:', err);
        res.status(500).json({ error: { code: '5000', message: 'Failed to fetch results' } });
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
