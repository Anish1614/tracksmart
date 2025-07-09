from flask import Flask, request, jsonify
from beckn.discovery import discover_logistics
from beckn.tracking import track_order

app = Flask(__name__)

@app.route('/api/discover', methods=['POST'])
def api_discover():
    data = request.json
    result = discover_logistics(data)
    return jsonify(result)

@app.route('/api/track', methods=['POST'])
def api_track():
    data = request.json
    result = track_order(data['order_id'])
    return jsonify(result)

if __name__ == "__main__":
    app.run(debug=True)
