# Smartender Server

Node.js Express server for cocktail app business logic.

## Features

- REST API endpoints for:
  - Image upload and analysis
  - Ingredient list analysis
  - Recipe generation
  - Measurement conversion
- Integrates with Gemini/OpenAI for AI-powered parsing and suggestions
- Modular structure: controllers, services, routes

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the server:
   ```bash
   npm run dev
   ```
3. API will be available at `http://localhost:3000`

## Project Structure

- `src/index.js`: Server entry point
- `src/controllers/`: Request handlers
- `src/services/`: Business logic and AI integration
- `src/routes/`: API route definitions

## Next Steps

- Implement endpoints in `src/routes/`
- Add business logic to `src/services/`
- Connect mobile app to this API
