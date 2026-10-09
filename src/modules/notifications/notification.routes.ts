import { Router } from "express";
import { getDatabase } from "../../database/connection.js";
import { requireAuth, requireCustomer } from "../../middleware/auth.js";
import { ApiError } from "../../shared/api-error.js";

const router = Router();
router.use(requireAuth, requireCustomer);
router.get("/", (request, response) => {
  response.json({ data: getDatabase().prepare(`
    SELECT * FROM notifications WHERE user_id = ? ORDER BY sent_at DESC
  `).all(request.user!.id) });
});
router.patch("/:id/read", (request, response) => {
  const db = getDatabase();
  const result = db.prepare(`
    UPDATE notifications SET read_at = COALESCE(read_at, ?)
    WHERE id = ? AND user_id = ?
  `).run(new Date().toISOString(), String(request.params.id), request.user!.id);
  if (!result.changes) throw new ApiError(404, "Notification not found");
  response.json({ data: db.prepare("SELECT * FROM notifications WHERE id = ?").get(String(request.params.id)) });
});
export const notificationRouter = router;
