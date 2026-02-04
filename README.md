# SmartMeet Node.js Backend

This is the new Node.js backend for SmartMeet, replacing the legacy Python/Flask backend.

## Prerequisites

- Node.js (v14 or higher)
- npm (Node Package Manager)

## Setup

1.  Navigate to the `backend` directory:
    ```bash
    cd backend
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Configure Environment Variables:
    - Open `.env` file.
    - Add your **Google Gemini API Key** (`GEMINI_API_KEY`).
    - Add your **Gmail credentials** (`EMAIL_USER`, `EMAIL_PASS`).
      - *Note: For Gmail, you might need to use an "App Password" if 2FA is enabled.*

## Running the Server

- **Development Mode** (with auto-restart):
    ```bash
    npm run dev
    ```

- **Production Mode**:
    ```bash
    npm start
    ```

The server will start on `http://localhost:5000`.

## API Endpoints

- `GET /api/health`: Health check.
- `POST /api/schedule`: Schedule a meeting.
    - Body: `{ "query": "Meeting description...", "emails": "a@b.com, c@d.com" }`
- `GET /api/meetings`: Get all scheduled meetings.
- `GET /api/email-logs`: Get email sending logs.
- `GET /api/stats`: Get dashboard statistics.

## Architecture

- **`src/app.js`**: Entry point.
- **`src/controllers`**: Handles request logic.
- **`src/services`**: Business logic (Gemini, Email).
- **`src/routes`**: API route definitions.
