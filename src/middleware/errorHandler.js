/**
 * Centralised error handler. Maps known Mongoose/JWT error types to
 * meaningful HTTP responses so controllers stay clean.
 */
export const errorHandler = (err, req, res, _next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal Server Error";

  // Mongoose bad ObjectId
  if (err.name === "CastError") {
    statusCode = 400;
    message = `Invalid value for field '${err.path}': ${err.value}`;
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue)[0];
    message = `Duplicate value: '${err.keyValue[field]}' already exists for field '${field}'.`;
  }

  // Mongoose validation errors – collect all field messages
  if (err.name === "ValidationError") {
    statusCode = 422;
    message = Object.values(err.errors)
      .map((e) => e.message)
      .join("; ");
  }

  // Log stack in development only
  if (process.env.NODE_ENV === "development") {
    console.error(`[ERROR] ${err.stack}`);
  } else {
    console.error(`[ERROR] ${statusCode} - ${message}`);
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};
