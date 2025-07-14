const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(bodyParser.json());

// Connect to MongoDB (use 27018 if you changed the port in docker-compose.yml)
mongoose.connect('mongodb://localhost:27017/beckn_registry', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('Connected to MongoDB')).catch(err => console.error(err));

// Participant Schema
const participantSchema = new mongoose.Schema({
  subscriberId: { type: String, required: true, unique: true },
  type: { type: String, required: true, enum: ['BAP', 'BPP', 'BG'] },
  url: { type: String, required: true }
});
const Participant = mongoose.model('Participant', participantSchema);

// Register Participant
app.post('/api/participants', async (req, res) => {
  try {
    let { subscriberId, type, url } = req.body;
    if (!subscriberId) {
      subscriberId = `${type.toLowerCase()}-${uuidv4()}`;
    }
    const participant = new Participant({ subscriberId, type, url });
    await participant.save();
    res.status(201).json({ subscriberId, type, url });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Lookup Participants
app.get('/api/participants', async (req, res) => {
  try {
    const { type } = req.query;
    const query = type ? { type } : {}; // Return all if no type specified
    const participants = await Participant.find(query);
    res.json(participants.map(p => ({ subscriberId: p.subscriberId, url: p.url })));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Start Server
const PORT = 3030;
app.listen(PORT, () => console.log(`Registry running on port ${PORT}`));

