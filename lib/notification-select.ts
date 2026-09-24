/**
 * The exact columns the notification bell needs — shared by the server
 * layout (initial load) and the bell's realtime refetch (browser), so
 * both always return the same shape.
 */
export const NOTIFICATION_SELECT =
  "id, body, project_id, short_id, stage, is_read, created_at, kind, metadata, team_invite_id, team_invites(status), ownership_transfer_id, ownership_transfer_requests(status)";
