import { validationResult } from "express-validator";

/** Runs an express-validator chain list and returns a uniform 422 on failure. */
export const validate = (rules) => [
  ...rules,
  (req, res, next) => {
    const result = validationResult(req);
    if (result.isEmpty()) return next();
    return res.status(422).json({
      success: false,
      message: "Validation failed.",
      errors: result.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  },
];
