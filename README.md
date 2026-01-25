# Lifechange Dev - Backpack Exchange Balance API

A simple Express server that fetches real account balances from the Backpack Exchange API.

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Generate Backpack Exchange API Credentials

You need to generate an ED25519 keypair for Backpack Exchange API authentication. Run this Python command:

```bash
python3 -c "from cryptography.hazmat.primitives.asymmetric import ed25519; import base64; key = ed25519.Ed25519PrivateKey.generate(); seed = key.private_bytes_raw(); pub = key.public_key().public_bytes_raw(); print(f'Seed: {base64.b64encode(seed).decode()}\nPublic Key: {base64.b64encode(pub).decode()}')"
```

This will output:
- **Seed**: Your private key (keep this secret!)
- **Public Key**: Your API key

### 3. Configure Environment Variables

Create a `.env` file in the root directory:

```env
BACKPACK_API_KEY=your_base64_encoded_public_key_here
BACKPACK_SECRET_KEY=your_base64_encoded_private_seed_here
PORT=3000
```

**Important**: Never commit your `.env` file to version control. It's already in `.gitignore`.

### 4. Register Your API Key

After generating your keypair, you need to register the public key (API key) in your Backpack Exchange account settings.

## Running the Server

### Development Mode (with auto-reload)

```bash
npm run dev
```

### Production Mode

```bash
npm start
```

The server will start on `http://localhost:3000` (or the port specified in your `.env` file).

## API Endpoints

### `GET /api/balance`

Fetches account balances from Backpack Exchange API.

**Response:**
```json
{
  "balance": "1234.56",
  "currency": "usdc",
  "rawBalances": {
    "USDC": {
      "available": "1000.00",
      "locked": "234.56",
      "staked": "0.00"
    },
    ...
  }
}
```

The endpoint prioritizes USDC balance, falls back to USDT if USDC is not available, and includes all raw balance data for debugging.

### `GET /health`

Health check endpoint.

## Error Handling

If the Backpack Exchange API is unavailable or credentials are missing, the `/api/balance` endpoint will return a fallback response with mock data. Check the server logs for detailed error information.

## Documentation

For more information about the Backpack Exchange API, visit: https://docs.backpack.exchange/
