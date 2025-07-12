const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5002;

app.use(bodyParser.json());

// Generate unique IDs
const generateId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// ========== BECKN BAP Endpoints ==========

// Outbound: BAP -> BPP
app.post('/search', async (req, res) => {
    const { context, message } = req.body;

    // Validate payload
    if (!context || context.action !== 'search' || context.domain !== 'nic2004:60212' || !message.intent?.fulfillment) {
        return res.status(400).json({ error: 'Invalid search payload' });
    }

    // Forward /search to BPP
    try {
        await axios.post(`${context.bpp_uri}/search`, req.body, {
            headers: { 'Content-Type': 'application/json' }
        });
        res.json({ context, message: { ack: { status: 'ACK' } } });
    } catch (error) {
        console.error('❌ Error sending /search:', error.message);
        res.status(500).json({ error: 'Failed to search for couriers' });
    }
});

app.post('/select', async (req, res) => {
    const { context, message } = req.body;

    // Validate payload
    if (!context || context.action !== 'select' || context.domain !== 'nic2004:60212' || !message.order?.provider || !message.order.items) {
        return res.status(400).json({ error: 'Missing required fields: context, order.provider, order.items' });
    }

    // Forward /select to BPP
    try {
        const response = await axios.post(`${context.bpp_uri}/select`, req.body, {
            headers: { 'Content-Type': 'application/json' }
        });
        res.json({
            context,
            message: { ack: { status: response.data.message?.ack?.status || 'ACK' } }
        });
    } catch (error) {
        console.error('❌ Error sending /select:', error.message);
        res.status(500).json({ error: 'Failed to select courier' });
    }
});

app.post('/init', async (req, res) => {
    const { context, message } = req.body;

    // Validate payload
    if (!context || context.action !== 'init' || context.domain !== 'nic2004:60212' || !message.order?.provider || !message.order.items || !message.order.fulfillment) {
        return res.status(400).json({
            error: 'Missing required fields: context, order.provider, order.items, order.fulfillment'
        });
    }

    // Forward /init to BPP
    try {
        const response = await axios.post(`${context.bpp_uri}/init`, req.body, {
            headers: { 'Content-Type': 'application/json' }
        });
        res.json({
            context,
            message: { ack: { status: response.data.message?.ack?.status || 'ACK' } }
        });
    } catch (error) {
        console.error('❌ Error sending /init:', error.message);
        res.status(500).json({ error: 'Failed to initialize order' });
    }
});

app.post('/confirm', async (req, res) => {
    const { context, message } = req.body;

    // Validate payload
    if (!context || context.action !== 'confirm' || context.domain !== 'nic2004:60212' || !message.order?.id || !message.order.provider || !message.order.items) {
        return res.status(400).json({
            error: 'Missing required fields: context, order.id, order.provider, order.items'
        });
    }

    // Forward /confirm to BPP
    try {
        const response = await axios.post(`${context.bpp_uri}/confirm`, req.body, {
            headers: { 'Content-Type': 'application/json' }
        });
        res.json({
            context,
            message: { ack: { status: response.data.message?.ack?.status || 'ACK' } }
        });
    } catch (error) {
        console.error('❌ Error sending /confirm:', error.message);
        res.status(500).json({ error: 'Failed to confirm order' });
    }
});

app.post('/track', async (req, res) => {
    const { context, message } = req.body;

    // Validate payload
    if (!context || context.action !== 'track' || context.domain !== 'nic2004:60212' || !message.order_id) {
        return res.status(400).json({
            error: 'Missing required fields: context, order_id'
        });
    }

    // Forward /track to BPP
    try {
        const response = await axios.post(`${context.bpp_uri}/track`, req.body, {
            headers: { 'Content-Type': 'application/json' }
        });
        res.json({
            context,
            message: { ack: { status: response.data.message?.ack?.status || 'ACK' } }
        });
    } catch (error) {
        console.error('❌ Error sending /track:', error.message);
        res.status(500).json({ error: 'Failed to track order' });
    }
});

app.post('/cancel', async (req, res) => {
    const { context, message } = req.body;

    // Validate payload
    if (!context || context.action !== 'cancel' || context.domain !== 'nic2004:60212' || !message.order_id || !message.cancellation_reason_id) {
        return res.status(400).json({
            error: 'Missing required fields: context, order_id, cancellation_reason_id'
        });
    }

    // Forward /cancel to BPP
    try {
        const response = await axios.post(`${context.bpp_uri}/cancel`, req.body, {
            headers: { 'Content-Type': 'application/json' }
        });
        res.json({
            context,
            message: { ack: { status: response.data.message?.ack?.status || 'ACK' } }
        });
    } catch (error) {
        console.error('❌ Error sending /cancel:', error.message);
        res.status(500).json({ error: 'Failed to cancel order' });
    }
});

app.post('/support', async (req, res) => {
    const { context, message } = req.body;

    // Validate payload
    if (!context || context.action !== 'support' || context.domain !== 'nic2004:60212' || !message.ref_id) {
        return res.status(400).json({
            error: 'Missing required fields: context, ref_id'
        });
    }

    // Forward /support to BPP
    try {
        const response = await axios.post(`${context.bpp_uri}/support`, req.body, {
            headers: { 'Content-Type': 'application/json' }
        });
        res.json({
            context,
            message: { ack: { status: response.data.message?.ack?.status || 'ACK' } }
        });
    } catch (error) {
        console.error('❌ Error sending /support:', error.message);
        res.status(500).json({ error: 'Failed to request support' });
    }
});

app.post('/rating', async (req, res) => {
    const { context, message } = req.body;

    // Validate payload
    if (!context || context.action !== 'rating' || context.domain !== 'nic2004:60212' || !message.ratings || !Array.isArray(message.ratings) || !message.ratings.length) {
        return res.status(400).json({
            error: 'Missing required fields: context, ratings'
        });
    }

    // Forward /rating to BPP
    try {
        const response = await axios.post(`${context.bpp_uri}/rating`, req.body, {
            headers: { 'Content-Type': 'application/json' }
        });
        res.json({
            context,
            message: { ack: { status: response.data.message?.ack?.status || 'ACK' } }
        });
    } catch (error) {
        console.error('❌ Error sending /rating:', error.message);
        res.status(500).json({ error: 'Failed to submit rating' });
    }
});

app.post('/status', async (req, res) => {
    const { context, message } = req.body;

    // Validate payload
    if (!context || context.action !== 'status' || context.domain !== 'nic2004:60212' || !message.order_id) {
        return res.status(400).json({
            error: 'Missing required fields: context, order_id'
        });
    }

    // Forward /status to BPP
    try {
        const response = await axios.post(`${context.bpp_uri}/status`, req.body, {
            headers: { 'Content-Type': 'application/json' }
        });
        res.json({
            context,
            message: { ack: { status: response.data.message?.ack?.status || 'ACK' } }
        });
    } catch (error) {
        console.error('❌ Error sending /status:', error.message);
        res.status(500).json({ error: 'Failed to request status' });
    }
});

app.post('/update', async (req, res) => {
    const { context, message } = req.body;

    // Validate payload
    if (!context || context.action !== 'update' || context.domain !== 'nic2004:60212' || !message.update_target || !message.order?.id) {
        return res.status(400).json({
            error: 'Missing required fields: context, update_target, order.id'
        });
    }

    // Forward /update to BPP
    try {
        const response = await axios.post(`${context.bpp_uri}/update`, req.body, {
            headers: { 'Content-Type': 'application/json' }
        });
        res.json({
            context,
            message: { ack: { status: response.data.message?.ack?.status || 'ACK' } }
        });
    } catch (error) {
        console.error('❌ Error sending /update:', error.message);
        res.status(500).json({ error: 'Failed to update order' });
    }
});

// Inbound: BPP -> BAP (Callbacks)
app.post('/on_search', async (req, res) => {
    const { context, message } = req.body;

    // Validate callback
    if (!context || context.action !== 'on_search' || !message) {
        console.error('❌ Invalid on_search callback');
        return res.status(400).json({ message: { ack: { status: 'NACK' } } });
    }

    res.json({ message: { ack: { status: 'ACK' } } });
});

app.post('/on_select', async (req, res) => {
    const { context, message } = req.body;

    // Validate callback
    if (!context || context.action !== 'on_select' || !message.order) {
        console.error('❌ Invalid on_select callback');
        return res.status(400).json({ message: { ack: { status: 'NACK' } } });
    }

    res.json({ message: { ack: { status: 'ACK' } } });
});

app.post('/on_init', async (req, res) => {
    const { context, message } = req.body;

    // Validate callback
    if (!context || context.action !== 'on_init' || !message) {
        console.error('❌ Invalid on_init callback');
        return res.status(400).json({ message: { ack: { status: 'NACK' } } });
    }

    res.json({ message: { ack: { status: 'ACK' } } });
});

app.post('/on_confirm', async (req, res) => {
    const { context, message } = req.body;

    // Validate callback
    if (!context || context.action !== 'on_confirm' || !message.order) {
        console.error('❌ Invalid on_confirm callback');
        return res.status(400).json({ message: { ack: { status: 'NACK' } } });
    }

    res.json({ message: { ack: { status: 'ACK' } } });
});

app.post('/on_track', async (req, res) => {
    const { context, message } = req.body;

    // Validate callback
    if (!context || context.action !== 'on_track' || !message.tracking) {
        console.error('❌ Invalid on_track callback');
        return res.status(400).json({ message: { ack: { status: 'NACK' } } });
    }

    res.json({ message: { ack: { status: 'ACK' } } });
});

app.post('/on_cancel', async (req, res) => {
    const { context, message } = req.body;

    // Validate callback
    if (!context || context.action !== 'on_cancel' || !message.order) {
        console.error('❌ Invalid on_cancel callback');
        return res.status(400).json({ message: { ack: { status: 'NACK' } } });
    }

    res.json({ message: { ack: { status: 'ACK' } } });
});

app.post('/on_support', async (req, res) => {
    const { context, message } = req.body;

    // Validate callback
    if (!context || context.action !== 'on_support' || !message.contact) {
        console.error('❌ Invalid on_support callback');
        return res.status(400).json({ message: { ack: { status: 'NACK' } } });
    }

    res.json({ message: { ack: { status: 'ACK' } } });
});

app.post('/on_rating', async (req, res) => {
    const { context, message } = req.body;

    // Validate callback
    if (!context || context.action !== 'on_rating' || !message.feedback) {
        console.error('❌ Invalid on_rating callback');
        return res.status(400).json({ message: { ack: { status: 'NACK' } } });
    }

    res.json({ message: { ack: { status: 'ACK' } } });
});

app.post('/on_status', async (req, res) => {
    const { context, message } = req.body;

    // Validate callback
    if (!context || context.action !== 'on_status' || !message.order) {
        console.error('❌ Invalid on_status callback');
        return res.status(400).json({ message: { ack: { status: 'NACK' } } });
    }

    res.json({ message: { ack: { status: 'ACK' } } });
});

app.post('/on_update', async (req, res) => {
    const { context, message } = req.body;

    // Validate callback
    if (!context || context.action !== 'on_update' || !message.order) {
        console.error('❌ Invalid on_update callback');
        return res.status(400).json({ message: { ack: { status: 'NACK' } } });
    }

    res.json({ message: { ack: { status: 'ACK' } } });
});

// Root route
app.get('/', (req, res) => {
    res.send('Rohan Pal - TrackSmart BAP is running');
});

// Start the server
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});