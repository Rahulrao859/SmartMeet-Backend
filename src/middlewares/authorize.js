'use strict';

/**
 * authorize(...roles) — RBAC middleware factory
 * 
 * Usage in routes:
 *   const authorize = require('../middlewares/authorize');
 *   router.get('/admin/users', auth, authorize('admin'), controller.fn);
 *   router.get('/team',        auth, authorize('admin', 'manager'), controller.fn);
 *
 * Must be placed AFTER the `auth` middleware (which attaches req.user).
 */
const authorize = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const userRole = req.user.role || 'member';

        if (!allowedRoles.includes(userRole)) {
            return res.status(403).json({
                error: `Access denied. Required role(s): ${allowedRoles.join(', ')}. Your role: ${userRole}`,
            });
        }

        next();
    };
};

module.exports = authorize;
