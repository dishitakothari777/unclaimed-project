import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_FILE = path.join(__dirname, 'database.json');
const INITIAL_DATA_FILE = path.join(__dirname, 'initial_data.json');

let data = {
  users: [],
  projects: [],
  materials: [],
  stories: [],
  notifications: [],
  project_updates: [],
  bookmarks: [],
  adoption_requests: [],
  collaborations: [],
  collaboration_requests: [],
  reviews: [],
  reports: []
};

// Initialize or load DB
try {
  if (fs.existsSync(DB_FILE)) {
    data = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
  } else if (fs.existsSync(INITIAL_DATA_FILE)) {
    data = JSON.parse(fs.readFileSync(INITIAL_DATA_FILE, 'utf-8'));
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  }
} catch (err) {
  console.error('Error loading database:', err);
}

function save() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving database:', err);
  }
}

function nextId(collection) {
  if (!collection || collection.length === 0) return 1;
  const max = collection.reduce((m, item) => Math.max(m, Number(item.id) || 0), 0);
  return max + 1;
}

export const db = {
  get data() { return data; },
  save,
  
  users: {
    all: () => data.users || [],
    findById: (id) => (data.users || []).find(u => Number(u.id) === Number(id)),
    findByUsername: (uname) => (data.users || []).find(u => u.username && u.username.toLowerCase() === uname.toLowerCase()),
    findByEmail: (email) => (data.users || []).find(u => u.email && u.email.toLowerCase() === email.toLowerCase()),
    findByFirebaseUid: (uid) => (data.users || []).find(u => u.firebase_uid === uid),
    findByUsernameOrEmail: (identifier) => {
      if (!identifier) return null;
      const lower = identifier.trim().toLowerCase();
      return (data.users || []).find(u => 
        (u.username && u.username.toLowerCase() === lower) ||
        (u.email && u.email.toLowerCase() === lower)
      );
    },
    create: (user) => {
      user.id = nextId(data.users);
      user.created_at = user.created_at || new Date().toISOString();
      data.users.push(user);
      save();
      return user;
    },
    update: (id, updates) => {
      const u = (data.users || []).find(u => Number(u.id) === Number(id));
      if (u) {
        Object.assign(u, updates);
        save();
      }
      return u;
    }
  },

  projects: {
    all: () => data.projects || [],
    findById: (id) => (data.projects || []).find(p => Number(p.id) === Number(id)),
    filter: (fn) => (data.projects || []).filter(fn),
    create: (proj) => {
      proj.id = nextId(data.projects);
      proj.created_at = proj.created_at || new Date().toISOString();
      proj.updated_at = new Date().toISOString();
      proj.likes_count = proj.likes_count || 0;
      data.projects.push(proj);
      save();
      return proj;
    },
    update: (id, updates) => {
      const p = (data.projects || []).find(p => Number(p.id) === Number(id));
      if (p) {
        Object.assign(p, updates);
        p.updated_at = new Date().toISOString();
        save();
      }
      return p;
    },
    delete: (id) => {
      const idx = (data.projects || []).findIndex(p => Number(p.id) === Number(id));
      if (idx !== -1) {
        const deleted = data.projects.splice(idx, 1)[0];
        save();
        return deleted;
      }
      return null;
    }
  },

  materials: {
    all: () => data.materials || [],
    findById: (id) => (data.materials || []).find(m => Number(m.id) === Number(id)),
    filter: (fn) => (data.materials || []).filter(fn),
    create: (mat) => {
      mat.id = nextId(data.materials);
      mat.created_at = mat.created_at || new Date().toISOString();
      mat.status = mat.status || 'Available';
      data.materials.push(mat);
      save();
      return mat;
    },
    update: (id, updates) => {
      const m = (data.materials || []).find(m => Number(m.id) === Number(id));
      if (m) {
        Object.assign(m, updates);
        save();
      }
      return m;
    }
  },

  stories: {
    all: () => data.stories || [],
    findById: (id) => (data.stories || []).find(s => Number(s.id) === Number(id)),
    create: (s) => {
      s.id = nextId(data.stories);
      s.created_at = s.created_at || new Date().toISOString();
      s.views_count = s.views_count || 0;
      data.stories.push(s);
      save();
      return s;
    }
  },

  notifications: {
    forUser: (userId) => (data.notifications || []).filter(n => Number(n.user_id) === Number(userId)),
    unreadCount: (userId) => (data.notifications || []).filter(n => Number(n.user_id) === Number(userId) && !n.is_read).length,
    create: (notif) => {
      notif.id = nextId(data.notifications);
      notif.created_at = notif.created_at || new Date().toISOString();
      notif.is_read = notif.is_read || false;
      data.notifications.push(notif);
      save();
      return notif;
    },
    markAllRead: (userId) => {
      (data.notifications || []).forEach(n => {
        if (Number(n.user_id) === Number(userId)) n.is_read = true;
      });
      save();
    }
  },

  bookmarks: {
    all: () => data.bookmarks || [],
    forUser: (userId) => (data.bookmarks || []).filter(b => Number(b.user_id) === Number(userId)),
    isBookmarked: (userId, projectId) => (data.bookmarks || []).some(b => Number(b.user_id) === Number(userId) && Number(b.project_id) === Number(projectId)),
    toggle: (userId, projectId) => {
      const idx = (data.bookmarks || []).findIndex(b => Number(b.user_id) === Number(userId) && Number(b.project_id) === Number(projectId));
      if (idx !== -1) {
        data.bookmarks.splice(idx, 1);
        save();
        return false; // unbookmarked
      } else {
        data.bookmarks.push({
          id: nextId(data.bookmarks),
          user_id: Number(userId),
          project_id: Number(projectId),
          created_at: new Date().toISOString()
        });
        save();
        return true; // bookmarked
      }
    }
  },

  adoptions: {
    all: () => data.adoption_requests || [],
    findById: (id) => (data.adoption_requests || []).find(a => Number(a.id) === Number(id)),
    forApplicant: (userId) => (data.adoption_requests || []).filter(a => Number(a.applicant_id) === Number(userId)),
    forProject: (projectId) => (data.adoption_requests || []).filter(a => Number(a.project_id) === Number(projectId)),
    create: (req) => {
      req.id = nextId(data.adoption_requests);
      req.created_at = req.created_at || new Date().toISOString();
      req.updated_at = new Date().toISOString();
      req.status = req.status || 'Pending Review';
      data.adoption_requests.push(req);
      save();
      return req;
    },
    update: (id, updates) => {
      const a = (data.adoption_requests || []).find(a => Number(a.id) === Number(id));
      if (a) {
        Object.assign(a, updates);
        a.updated_at = new Date().toISOString();
        save();
      }
      return a;
    }
  },

  collaborations: {
    all: () => data.collaborations || [],
    requests: () => data.collaboration_requests || [],
    createRequest: (req) => {
      req.id = nextId(data.collaboration_requests);
      req.created_at = req.created_at || new Date().toISOString();
      req.status = req.status || 'Pending';
      data.collaboration_requests.push(req);
      save();
      return req;
    },
    forUser: (userId) => (data.collaborations || []).filter(c => Number(c.user_id) === Number(userId))
  },

  projectUpdates: {
    forProject: (projectId) => (data.project_updates || []).filter(u => Number(u.project_id) === Number(projectId)),
    create: (up) => {
      up.id = nextId(data.project_updates);
      up.created_at = up.created_at || new Date().toISOString();
      data.project_updates.push(up);
      save();
      return up;
    }
  },

  reviews: {
    forUser: (userId) => (data.reviews || []).filter(r => Number(r.reviewee_id) === Number(userId)),
    create: (rev) => {
      rev.id = nextId(data.reviews);
      rev.created_at = rev.created_at || new Date().toISOString();
      data.reviews.push(rev);
      save();
      return rev;
    }
  },

  reports: {
    create: (rep) => {
      rep.id = nextId(data.reports);
      rep.created_at = rep.created_at || new Date().toISOString();
      rep.status = 'Under Review';
      data.reports.push(rep);
      save();
      return rep;
    }
  }
};
