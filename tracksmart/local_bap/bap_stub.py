from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route('/beckn/bap/search', methods=['POST'])
def search():
    data = request.json
    print("Received search request:", data)
    # Respond with a dummy logistics provider response
    return jsonify({
        "context": data["context"],
        "message": {
            "catalog": {
                "fulfillments": [
                    {
                        "id": "logistics-provider-1",
                        "start": {"location": {"gps": "12.9716,77.5946"}},
                        "end": {"location": {"gps": "13.0827,80.2707"}},
                        "vehicle": {"category": "Bike"}
                    }
                ]
            }
        }
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001)
