import { Router } from "express";
import { register, login, getMe, getAllUsers, deactivateUser, changePassword } from "../controllers/authController.js";
import { body } from "express-validator";
import { validate } from "../middleware/validate.js";
import AuditLog from "../models/AuditLog.js";
import { protect, authorize } from "../middleware/auth.js";
import { authLimiter } from "../middleware/rateLimiter.js";

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: User authentication and account management
 */

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Create a user account (hq_admin only; no public sign-up)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password, role]
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *                 minLength: 8
 *               role:
 *                 type: string
 *                 enum: [hq_admin, provincial_admin, station_officer, device]
 *               province:
 *                 type: string
 *               district:
 *                 type: string
 *     responses:
 *       201:
 *         description: User registered successfully
 *       409:
 *         description: Email already exists
 */
const strongPassword = (field) =>
  body(field)
    .isString()
    .isLength({ min: 10 }).withMessage("Password must be at least 10 characters")
    .matches(/[a-z]/).withMessage("Password needs a lowercase letter")
    .matches(/[A-Z]/).withMessage("Password needs an uppercase letter")
    .matches(/\d/).withMessage("Password needs a digit");

// Accounts are issued by HQ only (previously open to anyone – privilege-escalation risk)
router.post(
  "/register",
  protect,
  authorize("hq_admin"),
  validate([
    body("name").isString().trim().notEmpty(),
    body("email").isEmail().normalizeEmail(),
    strongPassword("password"),
    body("role").isIn(["hq_admin", "provincial_admin", "station_officer"]),
    body("province").optional().isMongoId(),
    body("district").optional().isMongoId(),
  ]),
  register
);

router.patch(
  "/me/password",
  protect,
  validate([body("currentPassword").isString().notEmpty(), strongPassword("newPassword")]),
  changePassword
);

// Who accessed which tracking data (hq_admin only)
router.get("/audit-log", protect, authorize("hq_admin"), async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const filter = {};
    if (typeof req.query.action === "string") filter.action = req.query.action;
    const logs = await AuditLog.find(filter).populate("user", "name email role").sort({ createdAt: -1 }).limit(limit);
    res.status(200).json({ success: true, count: logs.length, data: logs });
  } catch (e) {
    next(e);
  }
});

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login and receive JWT token
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 example: admin@police.lk
 *               password:
 *                 type: string
 *                 example: password123
 *     responses:
 *       200:
 *         description: Login successful – returns JWT token
 *       401:
 *         description: Invalid credentials
 */
router.post("/login", authLimiter, login);

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Get current authenticated user's profile
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: User profile returned
 *       401:
 *         description: Unauthorized
 */
router.get("/me", protect, getMe);

/**
 * @swagger
 * /api/auth/users:
 *   get:
 *     summary: List all users (HQ Admin only)
 *     tags: [Auth]
 *     parameters:
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of users
 */
router.get("/users", protect, authorize("hq_admin"), getAllUsers);

/**
 * @swagger
 * /api/auth/users/{id}/deactivate:
 *   patch:
 *     summary: Deactivate a user account (HQ Admin only)
 *     tags: [Auth]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User deactivated
 *       404:
 *         description: User not found
 */
router.patch("/users/:id/deactivate", protect, authorize("hq_admin"), deactivateUser);

export default router;
