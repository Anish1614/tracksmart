const express = require('express');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());

// Root endpoint to display name
app.get('/', (req, res) => {
    res.send('Hello, my name is Rohan!');
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});