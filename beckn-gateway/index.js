const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

// Registry URL
const REGISTRY_URL = 'http://localhost:3030/api/participants';

// Handle Search Request
app.post('/search', async (req, res) => {
  try {
    const { context, message } = req.body;

    // Query Registry for BPPs
    const response = await axios.get(REGISTRY_URL, { params: { type: 'BPP', domain: context.domain } });
    const bpps = response.data;

    // Forward Search to BPPs
    const promises = bpps.map(bpp =>
      axios.post(`${bpp.url}/search`, { context, message })
        .catch(err => ({ bpp: bpp.subscriberId, error: err.message }))
    );
    const results = await Promise.all(promises);

    // Respond to BAP
    res.json({ status: 'ACK', results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Handle On-Search Callback
app.post('/on_search', async (req, res) => {
  try {
    const { context, message } = req.body;
    const bapUrl = context.bap_uri;
    // Forward on_search to BAP
    await axios.post(`${bapUrl}/on_search`, { context, message });
    res.json({ status: 'ACK' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start Server
const PORT = 5000;
app.listen(PORT, () => console.log(`Gateway running on port ${PORT}`));
