import swaggerJsdoc from "swagger-jsdoc";
import swaggerUiExpress from "swagger-ui-express";

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Tuk-Tuk Tracker API",
      version: "1.0.0",
      description:
        "Real-Time Three-Wheeler (Tuk-Tuk) Tracking & Movement Logging System for Sri Lanka Police. " +
        "Provides secure endpoints for vehicle registration, live location tracking, and historical movement analysis.",
      contact: {
        name: "NB6007CEM - Web API Development",
      },
    },
    servers: [
      {
        url: process.env.API_URL || "http://localhost:3000",
        description: "API Server",
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Enter JWT token obtained from /api/auth/login",
        },
      },
      schemas: {
        ErrorResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: false },
            message: { type: "string" },
          },
        },
        SuccessResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            data: { type: "object" },
          },
        },
      },
    },
    security: [{ BearerAuth: [] }],
  },
  apis: ["./src/routes/*.js", "./src/models/*.js"],
};

export const swaggerSpec = swaggerJsdoc(options);
export const swaggerUi = swaggerUiExpress;
