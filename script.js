/*
  Watershed Management App
  -------------------------
  This file contains all the client-side logic for a simple SPA (Single Page Application)
  that supports two roles: Admin and Surveyor. Data is persisted in localStorage under
  a single key. No backend is required, making it easy to run by simply opening
  index.html in a browser. The app supports:
    - Login and logout (simple credential check stored in localStorage)
    - Admin: project setup, surveyor management, unit cost catalog, project assignments,
      activity overview and cost summary.
    - Surveyor: view assigned projects, capture activity lines (with cost calculation),
      and list their own activities.

  To reset the application data, clear your browser's localStorage for this site.
*/

(function () {
  // Grab the root container
  const app = document.getElementById('app');

  // Key used to store all data in localStorage
  const STORAGE_KEY = 'watershedAppData';

  // Default fund heads and their contribution rules
  const HEADS = ['NRM', 'Climate', 'Livelihood', 'Training', 'Management'];

  // Subheads for climate proofing. Based on guideline Table 2.
  const CLIMATE_SUBHEADS = [
    'Efficient use of water resources',
    'Soil improvement and productivity enhancement',
    'Sustainable NRM & CCA farming for resilience/food security',
    'Climate risk mitigation'
  ];

  // Track the current sort field for activities. Default is by date (newest first).
  let activitySortField = 'date';
  // Track the current sort field for approval listing. Default is by date (newest first).
  let approvalSortField = 'date';

  // Track the current sort field for implementation listing. Default is by date (newest first).
  // Supported values: 'date' (earliest sanctioned activity date) and 'head' (alphabetical).
  let implementationSortField = 'date';

  // Track sort order (ascending or descending) for each listing.  These
  // variables work in tandem with the corresponding sort field variables
  // above.  When a user clicks on a sortable table header, the order
  // toggles between ascending ('asc') and descending ('desc').  For
  // activities and approval lists, we default to descending order so
  // recent entries appear first.  For implementation, we default to
  // ascending (earliest sanction date first).
  let activitySortOrder = 'desc';
  let approvalSortOrder = 'desc';
  let implementationSortOrder = 'asc';

  /**
   * Apply a previously saved theme setting.  If the user selected dark
   * mode during a previous session, the <body> element will already
   * have the "dark-mode" class.  Otherwise, light mode remains.
   */
  (function applySavedTheme() {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark') {
      document.body.classList.add('dark-mode');
    }
  })();

  /**
   * Insert a dark mode toggle button into the specified container.
   * The button toggles the "dark-mode" class on <body> and updates
   * localStorage so the choice persists across sessions.  The button
   * label automatically reflects the current state ("Dark Mode" or
   * "Light Mode").
   * @param {HTMLElement} container A DOM element to receive the toggle
   */
  function initDarkModeToggle(container) {
    if (!container) return;
    const btn = document.createElement('button');
    btn.className = 'secondary small';
    function updateLabel() {
      btn.textContent = document.body.classList.contains('dark-mode') ? 'Light Mode' : 'Dark Mode';
    }
    updateLabel();
    btn.addEventListener('click', function () {
      document.body.classList.toggle('dark-mode');
      // Persist theme preference
      if (document.body.classList.contains('dark-mode')) {
        localStorage.setItem('theme', 'dark');
      } else {
        localStorage.setItem('theme', 'light');
      }
      updateLabel();
    });
    container.appendChild(btn);
  }

  /**
   * Load data from localStorage. If none exists, return an empty structure.
   */
  function loadData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return { users: [], projects: [], assignments: [], catalog: [], beneficiaries: [], activities: [] };
      }
      return JSON.parse(raw);
    } catch (e) {
      console.warn('Failed to parse stored data, resetting.', e);
      localStorage.removeItem(STORAGE_KEY);
      return { users: [], projects: [], assignments: [], catalog: [], beneficiaries: [], activities: [] };
    }
  }

  /**
   * Persist the given data structure into localStorage.
   * @param {Object} data
   */
  function saveData(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  /**
   * Generate a pseudo-unique identifier. For the purposes of this simple app,
   * collisions are extremely unlikely and acceptable.
   */
  function generateId() {
    return '_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Initialize application data with a default admin user if none exists.
   */
  function ensureDefaultAdmin() {
    const data = loadData();
    // If no admin user present, create a default one
    if (!data.users.some(u => u.role === 'ADMIN')) {
      data.users.push({
        id: generateId(),
        name: 'Admin User',
        username: 'admin',
        password: 'admin123',
        role: 'ADMIN',
        active: true,
        phone: ''
      });
      // Add a sample surveyor for demonstration
      data.users.push({
        id: generateId(),
        name: 'Sample Surveyor',
        username: 'surveyor',
        password: 'survey123',
        role: 'SURVEYOR',
        active: true,
        phone: ''
      });
      saveData(data);
    }
  }

  /**
   * Retrieve the current session from sessionStorage. Returns null if not logged in.
   */
  function getSession() {
    try {
      const raw = sessionStorage.getItem('session');
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Save session data to sessionStorage.
   * @param {Object} session
   */
  function setSession(session) {
    sessionStorage.setItem('session', JSON.stringify(session));
  }

  /**
   * Clear session data, effectively logging the user out.
   */
  function clearSession() {
    sessionStorage.removeItem('session');
  }

  /**
   * Attempt to authenticate the given credentials. Returns an object with
   * user info on success or null on failure.
   * @param {string} username
   * @param {string} password
   */
  function authenticate(username, password) {
    const data = loadData();
    const user = data.users.find(u => u.username === username);
    if (!user) return null;
    if (!user.active) return null;
    if (user.password !== password) return null;
    // Remove password before returning
    const { password: pwd, ...safeUser } = user;
    return safeUser;
  }

  /**
   * Utility to create a DOM element from an HTML string. This simplifies
   * dynamic construction of table rows and other elements.
   * @param {string} html
   */
  function createElement(html) {
    const template = document.createElement('template');
    template.innerHTML = html.trim();
    return template.content.firstChild;
  }

  /**
   * Entry point to draw the appropriate UI based on the session state.
   */
  function render() {
    const session = getSession();
    ensureDefaultAdmin();
    if (!session) {
      showLoginPage();
    } else if (session.role === 'ADMIN') {
      showAdminPage(session);
    } else if (session.role === 'SURVEYOR') {
      showSurveyorPage(session);
    } else {
      clearSession();
      showLoginPage();
    }
  }

  /**
   * Render the login page. Provides inputs for username and password and
   * handles authentication.
   */
  function showLoginPage() {
    app.innerHTML = `
        <div class="login-page">
            <div class="login-container">
                <h1>Watershed Management</h1>
                <form id="loginForm">
                    <div class="form-group">
                        <input type="text" id="username" placeholder="Username" required>
                    </div>
                    <div class="form-group">
                        <input type="password" id="password" placeholder="Password" required>
                    </div>
                    <button type="submit">Login</button>
                </form>
                <div class="login-info">
                    Default credentials:<br>
                    <strong>Admin:</strong> admin / admin123<br>
                    <strong>Surveyor:</strong> surveyor/ survey123
                </div>
            </div>
        </div>
    `;
    const loginForm = document.getElementById('loginForm');
    loginForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value;
      const user = authenticate(username, password);
      if (!user) {
        const err = document.getElementById('loginError');
        err.textContent = 'Invalid credentials or account inactive.';
        err.style.display = 'block';
        return;
      }
      setSession(user);
      render();
    });
  }

  /*
    ================================
      Admin Interface
    ================================
  */

  let adminTab = 'projects';

  /**
   * Show the admin page with navigation and content area.
   * @param {Object} session
   */
  function showAdminPage(session) {
    app.innerHTML = '';
    // Header bar
    const header = createElement(`
      <header>
        <h2>Admin Dashboard</h2>
        <div class="user-info">
          Logged in as ${session.name} (<em>${session.username}</em>)
          <button id="logoutBtn" class="secondary small" style="margin-left:15px;">Logout</button>
        </div>
      </header>
    `);
    app.appendChild(header);
    header.querySelector('#logoutBtn').addEventListener('click', () => {
      clearSession();
      render();
    });

    // Insert dark mode toggle button in the user-info section
    const userInfoContainer = header.querySelector('.user-info');
    initDarkModeToggle(userInfoContainer);
    // Navigation
    // Consolidate surveyors, catalog and assignments into a single Manage tab
    const nav = createElement(`
      <nav>
        <button id="tab-projects" class="${adminTab === 'projects' ? 'active' : ''}">Projects</button>
        <button id="tab-manage" class="${adminTab === 'manage' ? 'active' : ''}">Manage</button>
        <button id="tab-activities" class="${adminTab === 'activities' ? 'active' : ''}">Activities</button>
        <button id="tab-summary" class="${adminTab === 'summary' ? 'active' : ''}">Summary</button>
        <button id="tab-approval" class="${adminTab === 'approval' ? 'active' : ''}">Approval</button>
        <button id="tab-implementation" class="${adminTab === 'implementation' ? 'active' : ''}">Implementation</button>
      </nav>
    `);
    app.appendChild(nav);
    nav.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.id.replace('tab-', '');
        adminTab = tabId;
        renderAdminTab();
        // Update active class
        nav.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
    // Content container
    const content = document.createElement('div');
    content.id = 'admin-content';
    app.appendChild(content);
    // Render initial tab content
    renderAdminTab();
  }

  /**
   * Dispatch rendering to the appropriate admin tab.
   */
  function renderAdminTab() {
    const container = document.getElementById('admin-content');
    if (!container) return;
    switch (adminTab) {
      case 'projects':
        renderAdminProjects(container);
        break;
      case 'manage':
        renderAdminManage(container);
        break;
      case 'activities':
        renderAdminActivities(container);
        break;
      case 'summary':
        renderAdminSummary(container);
        break;
      case 'approval':
        renderAdminApproval(container);
        break;
      case 'implementation':
        renderAdminImplementation(container);
        break;
      default:
        container.innerHTML = '<p>Unknown tab.</p>';
        break;
    }
  }

  /**
   * Render the projects management tab.
   * @param {HTMLElement} container
   */
  function renderAdminProjects(container) {
    const data = loadData();
    // Build form to add project
    container.innerHTML = `
      <h3>Projects</h3>
      <form id="projectForm">
        <div class="row">
          <div>
            <label>Title</label>
            <input type="text" id="projTitle" required />
          </div>
          <div>
            <label>Code</label>
            <input type="text" id="projCode" required />
          </div>
          <div>
            <label>State</label>
            <input type="text" id="projState" />
          </div>
          <div>
            <label>District</label>
            <input type="text" id="projDistrict" />
          </div>
          <div>
            <label>Area (ha)</label>
            <input type="number" id="projArea" min="0" step="0.01" />
          </div>
          <div>
            <label>Villages (comma separated)</label>
            <input type="text" id="projVillages" placeholder="e.g. Village1, Village2"/>
          </div>
        </div>
        <button type="submit">Add Project</button>
      </form>
      <div id="projectList"></div>
    `;
    // Handle form submission
    const projectForm = document.getElementById('projectForm');
    projectForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const title = document.getElementById('projTitle').value.trim();
      const code = document.getElementById('projCode').value.trim();
      const state = document.getElementById('projState').value.trim();
      const district = document.getElementById('projDistrict').value.trim();
      const area = document.getElementById('projArea').value;
      // Parse villages list from comma-separated input
      const villagesInput = document.getElementById('projVillages').value.trim();
      let villages = [];
      if (villagesInput) {
        villages = villagesInput.split(',').map(v => v.trim()).filter(v => v);
      }
      if (!title || !code) {
        alert('Title and code are required.');
        return;
      }
      const newProject = {
        id: generateId(),
        title,
        code,
        state,
        district,
        areaHa: area ? parseFloat(area) : undefined,
        status: 'active',
        villages
      };
      data.projects.unshift(newProject);
      saveData(data);
      // Reset form
      projectForm.reset();
      renderAdminProjects(container);
    });
    // Render existing projects
    const listDiv = document.getElementById('projectList');
    if (data.projects.length === 0) {
      listDiv.innerHTML = '<p>No projects created yet.</p>';
      return;
    }
    let html = '<table><thead><tr><th>Title</th><th>Code</th><th>Location</th><th>Area (ha)</th><th>Status</th><th>Villages</th><th>Actions</th></tr></thead><tbody>';
    data.projects.forEach(proj => {
      html += `<tr>
        <td>${proj.title}</td>
        <td>${proj.code}</td>
        <td>${[proj.state, proj.district].filter(Boolean).join(' · ')}</td>
        <td>${proj.areaHa !== undefined ? proj.areaHa : '-'}</td>
        <td>${proj.status}</td>
        <td>${proj.villages && proj.villages.length ? proj.villages.join(', ') : '-'}</td>
        <td><button class="small" data-action="deleteProj" data-id="${proj.id}">Delete</button></td>
      </tr>`;
    });
    html += '</tbody></table>';
    listDiv.innerHTML = html;
    // Attach delete project handlers
    listDiv.querySelectorAll('button[data-action="deleteProj"]').forEach(btn => {
      btn.addEventListener('click', function () {
        const projId = this.getAttribute('data-id');
        if (confirm('Are you sure you want to delete this project and all related data?')) {
          // Remove project, assignments, and activities
          deleteProjectAndRelated(projId);
          // Re-render the projects tab to reflect deletion
          renderAdminProjects(container);
          // If on summary tab, refresh summary when user navigates next time
        }
      });
    });
  }

  /**
   * Render the surveyor management tab.
   * @param {HTMLElement} container
   */
  function renderAdminSurveyors(container) {
    const data = loadData();
    container.innerHTML = `
      <h3>Surveyors</h3>
      <form id="surveyorForm">
        <div class="row">
          <div>
            <label>Name</label>
            <input type="text" id="survName" required />
          </div>
          <div>
            <label>Username</label>
            <input type="text" id="survUsername" required />
          </div>
          <div>
            <label>Password</label>
            <input type="password" id="survPassword" required />
          </div>
          <div>
            <label>Phone</label>
            <input type="text" id="survPhone" />
          </div>
        </div>
        <button type="submit">Add Surveyor</button>
      </form>
      <div id="surveyorList"></div>
    `;
    // Add surveyor
    const survForm = document.getElementById('surveyorForm');
    survForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const name = document.getElementById('survName').value.trim();
      const username = document.getElementById('survUsername').value.trim();
      const password = document.getElementById('survPassword').value;
      const phone = document.getElementById('survPhone').value.trim();
      if (!name || !username || !password) {
        alert('Name, username and password are required.');
        return;
      }
      // Check for existing username
      if (data.users.some(u => u.username === username)) {
        alert('Username already exists.');
        return;
      }
      const newUser = {
        id: generateId(),
        name,
        username,
        password,
        role: 'SURVEYOR',
        active: true,
        phone
      };
      data.users.push(newUser);
      saveData(data);
      survForm.reset();
      renderAdminSurveyors(container);
    });
    // Render surveyors list
    const listDiv = document.getElementById('surveyorList');
    const surveyors = data.users.filter(u => u.role === 'SURVEYOR');
    if (surveyors.length === 0) {
      listDiv.innerHTML = '<p>No surveyors found.</p>';
      return;
    }
    let html = '<table><thead><tr><th>Name</th><th>Username</th><th>Phone</th><th>Active</th><th>Actions</th></tr></thead><tbody>';
    surveyors.forEach(u => {
      html += `<tr>
        <td>${u.name}</td>
        <td>${u.username}</td>
        <td>${u.phone || '-'}</td>
        <td><input type="checkbox" data-id="${u.id}" ${u.active ? 'checked' : ''} class="toggleActive" /></td>
        <td><button class="danger small" data-id="${u.id}">Delete</button></td>
      </tr>`;
    });
    html += '</tbody></table>';
    listDiv.innerHTML = html;
    // Toggle active
    listDiv.querySelectorAll('.toggleActive').forEach(cb => {
      cb.addEventListener('change', function () {
        const id = this.getAttribute('data-id');
        const user = data.users.find(u => u.id === id);
        if (user) {
          user.active = this.checked;
          saveData(data);
        }
      });
    });
    // Delete surveyor
    listDiv.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', function () {
        const id = this.getAttribute('data-id');
        if (!confirm('Delete this surveyor?')) return;
        // Remove user
        const idx = data.users.findIndex(u => u.id === id);
        if (idx >= 0) data.users.splice(idx, 1);
        // Remove assignments and activities associated
        data.assignments = data.assignments.filter(a => a.surveyorId !== id);
        data.activities = data.activities.filter(a => a.createdBy !== id);
        saveData(data);
        renderAdminSurveyors(container);
      });
    });
  }

  /**
   * Render the catalog tab for defining activity unit costs.
   * @param {HTMLElement} container
   */
  function renderAdminCatalog(container) {
    const data = loadData();
    container.innerHTML = `
      <h3>Unit Cost Catalog</h3>
      <form id="catalogForm">
        <div class="row">
          <div>
            <label>Head</label>
            <select id="catHead" required>
              ${HEADS.map(h => `<option value="${h}">${h}</option>`).join('')}
            </select>
          </div>
          <div>
            <label>Activity Type</label>
            <input type="text" id="catType" required />
          </div>
          <div>
            <label>Unit Name</label>
            <input type="text" id="catUnit" required />
          </div>
          <div>
            <label>Unskilled Rate</label>
            <input type="number" id="catUnskilled" min="0" step="0.01" required />
          </div>
          <div>
            <label>Skilled Rate</label>
            <input type="number" id="catSkilled" min="0" step="0.01" required />
          </div>
          <div>
            <label>Material Rate</label>
            <input type="number" id="catMaterial" min="0" step="0.01" required />
          </div>
        </div>
        <button type="submit">Add Item</button>
      </form>
      <div id="catalogList"></div>
    `;
    // Add catalog item
    const catForm = document.getElementById('catalogForm');
    catForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const head = document.getElementById('catHead').value;
      const type = document.getElementById('catType').value.trim();
      const unit = document.getElementById('catUnit').value.trim();
      const unskilled = parseFloat(document.getElementById('catUnskilled').value);
      const skilled = parseFloat(document.getElementById('catSkilled').value);
      const material = parseFloat(document.getElementById('catMaterial').value);
      if (!head || !type || !unit) {
        alert('All fields are required.');
        return;
      }
      const newItem = {
        id: generateId(),
        head,
        type,
        unitName: unit,
        unitUnskilled: isNaN(unskilled) ? 0 : unskilled,
        unitSkilled: isNaN(skilled) ? 0 : skilled,
        unitMaterial: isNaN(material) ? 0 : material
      };
      data.catalog.push(newItem);
      saveData(data);
      catForm.reset();
      renderAdminCatalog(container);
    });
    // Render catalog list
    const listDiv = document.getElementById('catalogList');
    if (data.catalog.length === 0) {
      listDiv.innerHTML = '<p>No catalog items defined.</p>';
      return;
    }
    let html = '<table><thead><tr><th>Head</th><th>Type</th><th>Unit</th><th>Unskilled</th><th>Skilled</th><th>Material</th><th>Actions</th></tr></thead><tbody>';
    data.catalog.forEach(item => {
      html += `<tr>
        <td>${item.head}</td>
        <td>${item.type}</td>
        <td>${item.unitName}</td>
        <td>${item.unitUnskilled}</td>
        <td>${item.unitSkilled}</td>
        <td>${item.unitMaterial}</td>
        <td><button class="danger small" data-id="${item.id}">Delete</button></td>
      </tr>`;
    });
    html += '</tbody></table>';
    listDiv.innerHTML = html;
    // Delete catalog item
    listDiv.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', function () {
        const id = this.getAttribute('data-id');
        if (!confirm('Delete this catalog item?')) return;
        data.catalog = data.catalog.filter(i => i.id !== id);
        saveData(data);
        renderAdminCatalog(container);
      });
    });
  }

  /**
   * Render the assignments tab where projects are allocated to surveyors.
   * @param {HTMLElement} container
   */
  function renderAdminAssignments(container) {
    const data = loadData();
    const surveyors = data.users.filter(u => u.role === 'SURVEYOR' && u.active);
    const projects = data.projects;
    container.innerHTML = `
      <h3>Project Assignments</h3>
      <form id="assignForm">
        <div class="row">
          <div>
            <label>Project</label>
            <select id="assignProject" required>
              ${projects.map(p => `<option value="${p.id}">${p.title}</option>`).join('')}
            </select>
          </div>
          <div>
            <label>Surveyor</label>
            <select id="assignSurveyor" required>
              ${surveyors.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
            </select>
          </div>
        </div>
        <button type="submit">Assign</button>
      </form>
      <div id="assignList"></div>
    `;
    // Assign project
    const assignForm = document.getElementById('assignForm');
    assignForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const projectId = document.getElementById('assignProject').value;
      const surveyorId = document.getElementById('assignSurveyor').value;
      // Check duplicates
      if (data.assignments.some(a => a.projectId === projectId && a.surveyorId === surveyorId)) {
        alert('This project is already assigned to the selected surveyor.');
        return;
      }
      data.assignments.push({ id: generateId(), projectId, surveyorId });
      saveData(data);
      renderAdminAssignments(container);
    });
    // Render assignments list
    const listDiv = document.getElementById('assignList');
    if (data.assignments.length === 0) {
      listDiv.innerHTML = '<p>No assignments.</p>';
      return;
    }
    let html = '<table><thead><tr><th>Project</th><th>Surveyor</th><th>Actions</th></tr></thead><tbody>';
    data.assignments.forEach(a => {
      const proj = data.projects.find(p => p.id === a.projectId);
      const surv = data.users.find(u => u.id === a.surveyorId);
      html += `<tr>
        <td>${proj ? proj.title : a.projectId}</td>
        <td>${surv ? surv.name : a.surveyorId}</td>
        <td><button class="danger small" data-id="${a.id}">Remove</button></td>
      </tr>`;
    });
    html += '</tbody></table>';
    listDiv.innerHTML = html;
    listDiv.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', function () {
        const id = this.getAttribute('data-id');
        if (!confirm('Remove this assignment?')) return;
        data.assignments = data.assignments.filter(a => a.id !== id);
        saveData(data);
        renderAdminAssignments(container);
      });
    });
  }

  /**
   * Render the consolidated Manage tab. This combines surveyor management,
   * unit cost catalog and project assignments into a single page. Each section
   * contains its own form and list with independent event handlers. Data
   * persistence mirrors the original standalone tabs.
   * @param {HTMLElement} container
   */
  function renderAdminManage(container) {
    const data = loadData();
    // Build the combined management page structure
    container.innerHTML = `
      <h3>Surveyor Management</h3>
      <form id="surveyorForm">
        <div class="row">
          <div>
            <label>Name</label>
            <input type="text" id="survName" required />
          </div>
          <div>
            <label>Username</label>
            <input type="text" id="survUsername" required />
          </div>
          <div>
            <label>Password</label>
            <input type="password" id="survPassword" required />
          </div>
          <div>
            <label>Phone</label>
            <input type="text" id="survPhone" />
          </div>
        </div>
        <button type="submit">Add Surveyor</button>
      </form>
      <div id="surveyorList"></div>
      <hr style="margin:30px 0;" />
      <h3>Unit Cost Catalog</h3>
      <form id="catalogForm">
        <div class="row">
          <div>
            <label>Head</label>
            <select id="catHead" required>
              ${HEADS.map(h => `<option value="${h}">${h}</option>`).join('')}
            </select>
          </div>
          <div id="catSubheadDiv" style="display:none;">
            <label>Subhead</label>
            <select id="catSubhead">
              ${CLIMATE_SUBHEADS.map(s => `<option value="${s}">${s}</option>`).join('')}
            </select>
          </div>
          <div>
            <label>Activity Type</label>
            <input type="text" id="catType" required />
          </div>
          <div>
            <label>Unit Name</label>
            <input type="text" id="catUnit" required />
          </div>
          <div>
            <label>Unskilled Rate</label>
            <input type="number" id="catUnskilled" min="0" step="0.01" required />
          </div>
          <div>
            <label>Skilled Rate</label>
            <input type="number" id="catSkilled" min="0" step="0.01" required />
          </div>
          <div>
            <label>Material Rate</label>
            <input type="number" id="catMaterial" min="0" step="0.01" required />
          </div>
        </div>
        <button type="submit">Add Item</button>
      </form>
      <div id="catalogList"></div>
      <hr style="margin:30px 0;" />
      <h3>Project Assignments</h3>
      <form id="assignForm">
        <div class="row">
          <div>
            <label>Project</label>
            <select id="assignProject" required>
              ${data.projects.map(p => `<option value="${p.id}">${p.title}</option>`).join('')}
            </select>
          </div>
          <div>
            <label>Surveyor</label>
            <select id="assignSurveyor" required>
              ${data.users.filter(u => u.role === 'SURVEYOR' && u.active).map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
            </select>
          </div>
        </div>
        <button type="submit">Assign</button>
      </form>
      <div id="assignList"></div>
    `;
    // --- Surveyor Management Handlers ---
    const survForm = document.getElementById('surveyorForm');
    survForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const name = document.getElementById('survName').value.trim();
      const username = document.getElementById('survUsername').value.trim();
      const password = document.getElementById('survPassword').value;
      const phone = document.getElementById('survPhone').value.trim();
      if (!name || !username || !password) {
        alert('Name, username and password are required.');
        return;
      }
      // Check for existing username
      if (data.users.some(u => u.username === username)) {
        alert('Username already exists.');
        return;
      }
      const newUser = {
        id: generateId(),
        name,
        username,
        password,
        role: 'SURVEYOR',
        active: true,
        phone
      };
      data.users.push(newUser);
      saveData(data);
      survForm.reset();
      // Re-render manage tab to update lists and select options
      renderAdminManage(container);
    });
    // Render surveyors list
    const surveyorList = document.getElementById('surveyorList');
    const surveyors = data.users.filter(u => u.role === 'SURVEYOR');
    if (surveyors.length === 0) {
      surveyorList.innerHTML = '<p>No surveyors found.</p>';
    } else {
      let shtml = '<table><thead><tr><th>Name</th><th>Username</th><th>Phone</th><th>Active</th><th>Actions</th></tr></thead><tbody>';
      surveyors.forEach(u => {
        shtml += `<tr>
          <td>${u.name}</td>
          <td>${u.username}</td>
          <td>${u.phone || '-'}</td>
          <td><input type="checkbox" data-id="${u.id}" ${u.active ? 'checked' : ''} class="toggleActive" /></td>
          <td><button class="danger small" data-id="${u.id}">Delete</button></td>
        </tr>`;
      });
      shtml += '</tbody></table>';
      surveyorList.innerHTML = shtml;
      // Toggle active status
      surveyorList.querySelectorAll('.toggleActive').forEach(cb => {
        cb.addEventListener('change', function () {
          const id = this.getAttribute('data-id');
          const user = data.users.find(u => u.id === id);
          if (user) {
            user.active = this.checked;
            saveData(data);
          }
        });
      });
      // Delete surveyor
      surveyorList.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', function () {
          const id = this.getAttribute('data-id');
          if (!confirm('Delete this surveyor?')) return;
          // Remove user
          const idx = data.users.findIndex(u => u.id === id);
          if (idx >= 0) data.users.splice(idx, 1);
          // Remove assignments and activities associated
          data.assignments = data.assignments.filter(a => a.surveyorId !== id);
          data.activities = data.activities.filter(a => a.createdBy !== id);
          saveData(data);
          renderAdminManage(container);
        });
      });
    }
    // --- Catalog Management Handlers ---
    const catForm = document.getElementById('catalogForm');
    // Show/hide subhead selector based on selected head
    const catHeadSelect = document.getElementById('catHead');
    const catSubheadDiv = document.getElementById('catSubheadDiv');
    function toggleSubhead() {
      if (catHeadSelect.value === 'Climate') {
        catSubheadDiv.style.display = 'block';
      } else {
        catSubheadDiv.style.display = 'none';
      }
    }
    catHeadSelect.addEventListener('change', toggleSubhead);
    // initialize subhead visibility
    toggleSubhead();
    catForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const head = document.getElementById('catHead').value;
      const type = document.getElementById('catType').value.trim();
      const unit = document.getElementById('catUnit').value.trim();
      const unskilled = parseFloat(document.getElementById('catUnskilled').value);
      const skilled = parseFloat(document.getElementById('catSkilled').value);
      const material = parseFloat(document.getElementById('catMaterial').value);
      if (!head || !type || !unit) {
        alert('All fields are required.');
        return;
      }
      // Determine subhead for climate items. Only climate head uses subheads.
      const subheadVal = head === 'Climate' ? document.getElementById('catSubhead').value : '';
      const newItem = {
        id: generateId(),
        head,
        // Store subhead only for climate items. Blank otherwise.
        subhead: subheadVal || '',
        type,
        unitName: unit,
        unitUnskilled: isNaN(unskilled) ? 0 : unskilled,
        unitSkilled: isNaN(skilled) ? 0 : skilled,
        unitMaterial: isNaN(material) ? 0 : material
      };
      data.catalog.push(newItem);
      saveData(data);
      catForm.reset();
      renderAdminManage(container);
    });
    // Render catalog list
    const catalogList = document.getElementById('catalogList');
    if (data.catalog.length === 0) {
      catalogList.innerHTML = '<p>No catalog items defined.</p>';
    } else {
      // Include subhead column for climate items
      let chtml = '<table><thead><tr><th>Head</th><th>Subhead</th><th>Type</th><th>Unit</th><th>Unskilled</th><th>Skilled</th><th>Material</th><th>Actions</th></tr></thead><tbody>';
      data.catalog.forEach(item => {
        const sub = item.head === 'Climate' ? (item.subhead || '') : '';
        chtml += `<tr>
          <td>${item.head}</td>
          <td>${sub}</td>
          <td>${item.type}</td>
          <td>${item.unitName}</td>
          <td>${item.unitUnskilled}</td>
          <td>${item.unitSkilled}</td>
          <td>${item.unitMaterial}</td>
          <td><button class="danger small" data-id="${item.id}">Delete</button></td>
        </tr>`;
      });
      chtml += '</tbody></table>';
      catalogList.innerHTML = chtml;
      catalogList.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', function () {
          const id = this.getAttribute('data-id');
          if (!confirm('Delete this catalog item?')) return;
          data.catalog = data.catalog.filter(i => i.id !== id);
          saveData(data);
          renderAdminManage(container);
        });
      });
    }
    // --- Assignment Management Handlers ---
    const assignForm = document.getElementById('assignForm');
    assignForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const projectId = document.getElementById('assignProject').value;
      const surveyorId = document.getElementById('assignSurveyor').value;
      // Check duplicates
      if (data.assignments.some(a => a.projectId === projectId && a.surveyorId === surveyorId)) {
        alert('This project is already assigned to the selected surveyor.');
        return;
      }
      data.assignments.push({ id: generateId(), projectId, surveyorId });
      saveData(data);
      renderAdminManage(container);
    });
    // Render assignments list
    const assignList = document.getElementById('assignList');
    if (data.assignments.length === 0) {
      assignList.innerHTML = '<p>No assignments.</p>';
    } else {
      let ahtml = '<table><thead><tr><th>Project</th><th>Surveyor</th><th>Actions</th></tr></thead><tbody>';
      data.assignments.forEach(a => {
        const proj = data.projects.find(p => p.id === a.projectId);
        const surv = data.users.find(u => u.id === a.surveyorId);
        ahtml += `<tr>
          <td>${proj ? proj.title : a.projectId}</td>
          <td>${surv ? surv.name : a.surveyorId}</td>
          <td><button class="danger small" data-id="${a.id}">Remove</button></td>
        </tr>`;
      });
      ahtml += '</tbody></table>';
      assignList.innerHTML = ahtml;
      assignList.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', function () {
          const id = this.getAttribute('data-id');
          if (!confirm('Remove this assignment?')) return;
          data.assignments = data.assignments.filter(a => a.id !== id);
          saveData(data);
          renderAdminManage(container);
        });
      });
    }

    // --- Bulk Activity Upload Section ---
    const bulkSection = document.createElement('div');
    bulkSection.innerHTML = `
      <hr style="margin:30px 0;" />
      <h3>Bulk Activity Upload</h3>
      <p style="font-size:0.85em;">Upload a CSV file with columns: <strong>ProjectCode, Head, Subhead, ActivityType, Quantity, BeneficiaryName, BeneficiaryPhone, Village, BeneficiaryType, PlotNo, Lat, Lon, Convergence</strong></p>
      <div class="row">
        <div>
          <input type="file" id="bulkFile" accept=".csv" />
          <button id="bulkUploadBtn" class="small" style="margin-left:10px;">Upload</button>
        </div>
      </div>
      <div id="bulkUploadMsg" style="margin-top:10px;font-size:0.85em;color:#007bff;"></div>
    `;
    container.appendChild(bulkSection);

    // Add event handler for bulk upload
    const bulkFileInput = bulkSection.querySelector('#bulkFile');
    const bulkBtn = bulkSection.querySelector('#bulkUploadBtn');
    const bulkMsg = bulkSection.querySelector('#bulkUploadMsg');

    if (bulkBtn) {
      bulkBtn.addEventListener('click', function() {
        const file = bulkFileInput && bulkFileInput.files ? bulkFileInput.files[0] : null;
        if (!file) {
          alert('Please select a CSV file first.');
          return;
        }

        const reader = new FileReader();
        reader.onload = function(ev) {
          const text = ev.target.result;
          const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
          let imported = 0;
          let skipped = 0;

          lines.forEach((line, idx) => {
            // Skip header row if it contains column names
            if (idx === 0 && /project/i.test(line) && /head/i.test(line)) {
              return;
            }

            const parts = line.split(',').map(p => p.trim());
            if (parts.length < 5) {
              skipped++;
              return;
            }

            const [projCode, head, subhead, type, qtyStr, beneName, benePhone, village, beneType, plotNo, lat, lon, convStr] = parts;
            const quantity = parseFloat(qtyStr);

            if (!projCode || !head || !type || isNaN(quantity) || quantity <= 0) {
              skipped++;
              return;
            }

            // Find project by code
            const proj = data.projects.find(p => 
              (p.code && p.code.toLowerCase() === projCode.toLowerCase()) || 
              p.title.toLowerCase() === projCode.toLowerCase()
            );

            if (!proj) {
              skipped++;
              return;
            }

            // Find catalog item
            let catItem;
            if (head === 'Climate') {
              catItem = data.catalog.find(c => c.head === head && c.subhead === subhead && c.type === type);
            } else {
              catItem = data.catalog.find(c => c.head === head && c.type === type);
            }

            if (!catItem) {
              skipped++;
              return;
            }

            // Process beneficiary
            let beneId = null;
            const normalizedBType = beneType && beneType !== '' ? beneType : 'Individual';
            if (beneName || benePhone || village) {
              let bene = data.beneficiaries.find(b => 
                b.name === beneName && b.phone === benePhone && b.village === village
              );
              if (!bene) {
                bene = {
                  id: generateId(),
                  name: beneName || '',
                  phone: benePhone || '',
                  village: village || '',
                  type: normalizedBType
                };
                data.beneficiaries.push(bene);
              }
              beneId = bene.id;
            }

            // Calculate costs
            const unskilledTotal = quantity * (catItem.unitUnskilled || 0);
            const skilledTotal = quantity * (catItem.unitSkilled || 0);
            const materialTotal = quantity * (catItem.unitMaterial || 0);
            const total = unskilledTotal + skilledTotal + materialTotal;

            let contribution = 0;
            if (head === 'NRM') {
              contribution = 0.16 * quantity * (catItem.unitUnskilled || 0);
            } else if (head === 'Climate') {
              if (catItem.type === 'Soil Testing') {
                contribution = 0;
              } else {
                contribution = (normalizedBType === 'Individual') ? 0.25 * quantity * (catItem.unitMaterial || 0) : 0;
              }
            } else if (head === 'Livelihood') {
              contribution = 0.25 * quantity * (catItem.unitMaterial || 0);
            }

            const convVal = convStr ? parseFloat(convStr) : 0;
            const net = total - contribution - (isNaN(convVal) ? 0 : convVal);

            // Create activity
            const act = {
              id: generateId(),
              projectId: proj.id,
              head,
              subhead: head === 'Climate' ? (subhead || '') : '',
              type: catItem.type,
              unitName: catItem.unitName,
              quantity,
              unskilledRate: catItem.unitUnskilled,
              skilledRate: catItem.unitSkilled,
              materialRate: catItem.unitMaterial,
              unskilledTotal,
              skilledTotal,
              materialTotal,
              total,
              contribution,
              convergence: isNaN(convVal) ? 0 : convVal,
              netGrant: net,
              beneficiaryId: beneId,
              plotNumber: plotNo || '',
              lat: lat || null,
              lon: lon || null,
              createdBy: 'bulk-import',
              timestamp: Date.now()
            };

            data.activities.push(act);
            imported++;
          });

          saveData(data);
          bulkMsg.textContent = `Imported ${imported} activities${skipped ? ' (skipped ' + skipped + ' row' + (skipped > 1 ? 's' : '') + ')' : ''}.`;

          // Refresh activities and summary if viewing those tabs
          if (adminTab === 'activities') {
            renderAdminActivities(document.getElementById('admin-content'));
          }
          if (adminTab === 'summary') {
            renderAdminSummary(document.getElementById('admin-content'));
          }
        };

        reader.readAsText(file);
      });
    }
  }

  /**
   * Render the activities tab to show all recorded activities.
   * @param {HTMLElement} container
   */
  function renderAdminActivities(container) {
    const data = loadData();
    container.innerHTML = '<h3>Activities by Project</h3>';
    // For each project, display its activities in a separate table
    let any = false;
    data.projects.forEach(project => {
      // Clone and sort activities for this project based on selected sort field
      let acts = data.activities.filter(a => a.projectId === project.id);
      acts = acts.slice();
      acts.sort((a, b) => {
        let cmp = 0;
        if (activitySortField === 'date') {
          cmp = a.timestamp - b.timestamp; // ascending by default
        } else if (activitySortField === 'surveyor') {
          const survA = data.users.find(u => u.id === a.createdBy);
          const survB = data.users.find(u => u.id === b.createdBy);
          const nameA = survA ? survA.name : '';
          const nameB = survB ? survB.name : '';
          cmp = nameA.localeCompare(nameB);
        } else if (activitySortField === 'head') {
          cmp = a.head.localeCompare(b.head);
        } else if (activitySortField === 'type') {
          cmp = a.type.localeCompare(b.type);
        }
        return activitySortOrder === 'asc' ? cmp : -cmp;
      });
      if (acts.length === 0) return;
      any = true;
      // Build a header with project title and download buttons on the same line.
      // Use a flex container (.section-header) to align the title and buttons.  The
      // buttons allow downloading a CSV (Excel) or PDF of the activities for this
      // project.  We wrap them in a div with class download-buttons for styling.
      let html = `<div class="section-header"><h4>${project.title} (${project.code || ''})</h4>`;
      html += `<div class="download-buttons">`;
      html += `<button class="small" data-action="downloadAct" data-project="${project.id}">Download Excel</button>`;
      html += `<button class="small" data-action="downloadActPdf" data-project="${project.id}">Download PDF</button>`;
      html += `</div></div>`;
      // Determine sort icons for each sortable column.  When a column is
      // currently sorted, display an arrow indicating order.  Otherwise,
      // leave blank.
      const aIcons = {};
      ['date', 'surveyor', 'head', 'type'].forEach(f => {
        if (activitySortField === f) {
          aIcons[f] = (activitySortOrder === 'asc' ? ' ▲' : ' ▼');
        } else {
          aIcons[f] = '';
        }
      });
      // Give the table an id so it can be captured for PDF downloads.  The
      // activities table is scrollable horizontally if it exceeds the
      // viewport width.
      html += `<table id="activities-table-${project.id}"><thead><tr>` +
        `<th data-field="date" class="sortable">Date${aIcons.date}</th>` +
        `<th data-field="surveyor" class="sortable">Surveyor${aIcons.surveyor}</th>` +
        `<th data-field="head" class="sortable">Head${aIcons.head}</th>` +
        `<th data-field="type" class="sortable">Activity${aIcons.type}</th>` +
        '<th>Subhead</th>' +
        '<th>Beneficiary</th>' +
        '<th>Village</th>' +
        '<th>Lat</th>' +
        '<th>Lon</th>' +
        '<th>Map</th>' +
        '<th>Qty</th>' +
        '<th>Unit</th>' +
        '<th>Unit Cost</th>' +
        '<th>Total</th>' +
        '<th>Contribution</th>' +
        '<th>Convergence</th>' +
        '<th>Net Grant</th>' +
        '<th>Photos</th>' +
        '<th>Actions</th>' +
        '</tr></thead><tbody>';
      acts.forEach(act => {
        const surv = data.users.find(u => u.id === act.createdBy);
        const survName = surv ? surv.name : act.createdBy;
        const bene = data.beneficiaries.find(b => b.id === act.beneficiaryId);
        const beneName = bene ? bene.name : '';
        // Only display village for NRM activities.  For other heads, leave blank even if a beneficiary record exists.
        let village = '';
        if (act.head === 'NRM') {
          village = bene ? bene.village : '';
        }
        const sub = act.subhead || '';
        // Calculate unit cost and handle missing breakdown for older records
        const unitCost = ((act.unskilledRate || 0) + (act.skilledRate || 0) + (act.materialRate || 0));
        const conv = (act.convergence != null) ? act.convergence : 0;
        const net = (act.netGrant != null) ? act.netGrant : ((act.total || 0) - (act.contribution || 0) - conv);
        html += `<tr>
          <td>${new Date(act.timestamp).toLocaleDateString()}</td>
          <td>${survName}</td>
          <td>${act.head}</td>
          <td>${act.type}</td>
          <td>${sub}</td>
          <td>${beneName}</td>
          <td>${village}</td>
          <td>${act.lat || ''}</td>
          <td>${act.lon || ''}</td>
          <td>${(act.lat && act.lon) ? `<button class="small" data-action="viewMap" data-lat="${act.lat}" data-lon="${act.lon}">Map</button>` : ''}</td>
          <td>${act.quantity}</td>
          <td>${act.unitName || ''}</td>
          <td>${unitCost.toFixed(2)}</td>
          <td>${act.total.toFixed(2)}</td>
          <td>${act.contribution.toFixed(2)}</td>
          <td>${conv.toFixed(2)}</td>
          <td>${net.toFixed(2)}</td>
          <td>${act.photos && act.photos.length ? `<button class="small" data-action="viewPhotos" data-id="${act.id}">${act.photos.length}</button>` : '0'}</td>
          <td><button class="small" data-action="deleteAct" data-id="${act.id}">Delete</button></td>
        </tr>`;
      });
      html += '</tbody></table>';
      // Append to container
      const div = document.createElement('div');
      div.innerHTML = html;
      container.appendChild(div);
    });
    if (!any) {
      container.innerHTML += '<p>No activities recorded yet.</p>';
    }
    // Attach delete handlers for activities
    container.querySelectorAll('button[data-action="deleteAct"]').forEach(btn => {
      btn.addEventListener('click', function () {
        const actId = this.getAttribute('data-id');
        if (confirm('Are you sure you want to delete this activity?')) {
          deleteActivityById(actId);
          // Re-render the activities tab to update the list
          renderAdminActivities(container);
        }
      });
    });

    // Attach view photos handlers for activities.  When clicked, open a
    // new tab displaying all photos for the selected activity.  If
    // there are no photos, alert the user.
    container.querySelectorAll('button[data-action="viewPhotos"]').forEach(btn => {
      btn.addEventListener('click', function () {
        const id = this.getAttribute('data-id');
        const data = loadData();
        const act = data.activities.find(a => a.id === id);
        if (!act || !act.photos || act.photos.length === 0) {
          alert('No photos available for this activity.');
          return;
        }
        let html = '<html><head><title>Photos</title><style>body{font-family:Arial;margin:10px;background:#f6f6f6;color:#333;}img{max-width:100%;height:auto;margin-bottom:10px;box-shadow:0 2px 4px rgba(0,0,0,0.3);}p{margin:0 0 20px;font-size:0.8em;color:#555;}</style></head><body>';
        act.photos.forEach(p => {
          html += `<div><img src="${p.data}" alt="photo" /><p>${new Date(p.timestamp).toLocaleString()} - ${p.name}</p></div>`;
        });
        html += '</body></html>';
        const w = window.open('', '_blank');
        if (w) {
          w.document.write(html);
          w.document.close();
        }
      });
    });

    // Attach view map handlers.  Opens a new tab to OpenStreetMap at
    // the latitude and longitude of the activity.  Only works if
    // coordinates are present.
    container.querySelectorAll('button[data-action="viewMap"]').forEach(btn => {
      btn.addEventListener('click', function () {
        const lat = this.getAttribute('data-lat');
        const lon = this.getAttribute('data-lon');
        if (!lat || !lon) return;
        const url = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`;
        window.open(url, '_blank');
      });
    });

    // Attach sorting handlers for clickable headers.  When a sortable header
    // is clicked, toggle the sort order if the same field is clicked again
    // or set to ascending order for a new field, then re-render.
    container.querySelectorAll('th.sortable').forEach(th => {
      th.addEventListener('click', function () {
        const field = this.getAttribute('data-field');
        if (field) {
          if (activitySortField === field) {
            activitySortOrder = (activitySortOrder === 'asc' ? 'desc' : 'asc');
          } else {
            activitySortField = field;
            activitySortOrder = 'asc';
          }
          renderAdminActivities(container);
        }
      });
    });

    // Attach download handlers for activities lists.  These buttons
    // allow the admin to export activities for each project as either
    // a CSV (Excel-compatible) or a PDF.  We loop through every
    // download button and bind the appropriate event.  The
    // data-project attribute stores the project id to use.
    container.querySelectorAll('button[data-action="downloadAct"]').forEach(btn => {
      btn.addEventListener('click', function () {
        const pid = this.getAttribute('data-project');
        downloadActivitiesList(pid);
      });
    });
    container.querySelectorAll('button[data-action="downloadActPdf"]').forEach(btn => {
      btn.addEventListener('click', function () {
        const pid = this.getAttribute('data-project');
        downloadActivitiesPdf(pid);
      });
    });
  }

  /**
   * Render the summary tab with aggregated cost analysis per head.
   * @param {HTMLElement} container
   */
  function renderAdminSummary(container) {
    const data = loadData();
    // Fund caps as per specification
    const caps = {
      NRM: 42.5,
      Climate: 27.5,
      Livelihood: 7.5,
      Training: 5,
      Management: 17.5
    };
    if (data.projects.length === 0) {
      container.innerHTML = '<p>No projects available for summary.</p>';
      return;
    }
    let html = '<h3>Project Cost Summary</h3>';
    // Loop through each project to build individual summaries
    data.projects.forEach(project => {
      // Initialize per-head totals for this project
      const totals = {};
      HEADS.forEach(h => {
        totals[h] = {
          total: 0,
          contribution: 0,
          net: 0,
          material: 0,
          unskilled: 0,
          skilled: 0
        };
      });
      // Aggregate activities for this project
      data.activities.forEach(act => {
        if (act.projectId !== project.id) return;
        if (!totals[act.head]) return;
        const t = totals[act.head];
        // compute component costs on the fly in case older activities lack
        // materialTotal/unskilledTotal/skilledTotal fields.
        const matT = (act.materialTotal != null)
          ? act.materialTotal
          : (act.quantity * ((act.materialRate != null) ? act.materialRate : 0));
        const unskillT = (act.unskilledTotal != null)
          ? act.unskilledTotal
          : (act.quantity * ((act.unskilledRate != null) ? act.unskilledRate : 0));
        const skillT = (act.skilledTotal != null)
          ? act.skilledTotal
          : (act.quantity * ((act.skilledRate != null) ? act.skilledRate : 0));
        const totT = (act.total != null && !isNaN(act.total)) ? act.total : (matT + unskillT + skillT);
        const contr = (act.contribution != null) ? act.contribution : 0;
        // Convergence may not exist on old records, treat as 0
        const conv = (act.convergence != null) ? act.convergence : 0;
        const net = (act.netGrant != null) ? act.netGrant : (totT - contr - conv);
        t.total += totT;
        t.contribution += contr;
        t.net += net;
        t.material += matT;
        t.unskilled += unskillT;
        t.skilled += skillT;
      });
      // Compute grand total for this project
      let grandTotal = 0;
      HEADS.forEach(h => { grandTotal += totals[h].total; });
      // Header with download buttons.  Use a flex header so the buttons align
      // with the project title on the same line.
      html += `<div class="section-header project-summary" style="margin-bottom:30px;">`;
      html += `<h4>${project.title} (${project.code || ''})</h4>`;
      html += `<div class="download-buttons">`;
      html += `<button class="small" data-action="downloadSummary" data-project="${project.id}">Download Excel</button>`;
      // Replace image download with PDF download for summary tables
      html += `<button class="small" data-action="downloadSummaryPdf" data-project="${project.id}">Download PDF</button>`;
      html += `</div></div>`;
      // Build summary table for this project.  Give the table an id for image capture.
      html += `<table id="summary-table-${project.id}"><thead><tr><th>Head</th><th>Material</th><th>Unskilled</th><th>Skilled</th><th>Total Cost</th><th>Contribution</th><th>Net Grant</th><th>Cap (%)</th><th>Utilization (%)</th></tr></thead><tbody>`;
      // Accumulate aggregated sums across heads for a total row
      let aggMaterial = 0;
      let aggUnskilled = 0;
      let aggSkilled = 0;
      let aggTotal = 0;
      let aggContribution = 0;
      let aggNet = 0;
      HEADS.forEach(h => {
        const headTotal = totals[h].total;
        const util = grandTotal > 0 ? (headTotal / grandTotal * 100) : 0;
        aggMaterial += totals[h].material;
        aggUnskilled += totals[h].unskilled;
        aggSkilled += totals[h].skilled;
        aggTotal += totals[h].total;
        aggContribution += totals[h].contribution;
        aggNet += totals[h].net;
        html += `<tr data-project="${project.id}" data-head="${h}" style="cursor:pointer;">
          <td>${h}</td>
          <td>${totals[h].material.toFixed(2)}</td>
          <td>${totals[h].unskilled.toFixed(2)}</td>
          <td>${totals[h].skilled.toFixed(2)}</td>
          <td>${headTotal.toFixed(2)}</td>
          <td>${totals[h].contribution.toFixed(2)}</td>
          <td>${totals[h].net.toFixed(2)}</td>
          <td>${caps[h]}%</td>
          <td>${util.toFixed(1)}%</td>
        </tr>`;
      });
      // Append a total row across all heads within the table.  This row
      // consolidates material, unskilled, skilled, total, contribution and net
      // values so users can see the project-wide totals at a glance.  The
      // cap and utilisation columns are intentionally left blank in the
      // total row since they don’t apply to an aggregation across heads.
      html += `<tr class="total-row" style="font-weight:bold; background:#f8f8f8;">
        <td>Total</td>
        <td>${aggMaterial.toFixed(2)}</td>
        <td>${aggUnskilled.toFixed(2)}</td>
        <td>${aggSkilled.toFixed(2)}</td>
        <td>${aggTotal.toFixed(2)}</td>
        <td>${aggContribution.toFixed(2)}</td>
        <td>${aggNet.toFixed(2)}</td>
        <td></td>
        <td></td>
      </tr>`;
      html += '</tbody></table>';
      // Details container specific to this project
      html += `<div id="summaryDetails-${project.id}" style="margin-top:15px;"></div>`;
      html += '</div>';
    });
    container.innerHTML = html;
    // Attach download handlers: Excel and Image
    container.querySelectorAll('button[data-action="downloadSummary"]').forEach(btn => {
      btn.addEventListener('click', function () {
        const pid = this.getAttribute('data-project');
        downloadProjectSummary(pid);
      });
    });
    // Handle PDF download for summary tables
    container.querySelectorAll('button[data-action="downloadSummaryPdf"]').forEach(btn => {
      btn.addEventListener('click', function () {
        const pid = this.getAttribute('data-project');
        downloadSummaryPdf(pid);
      });
    });
    // Attach row click handlers for summary to show details
    container.querySelectorAll('table tbody tr').forEach(row => {
      row.addEventListener('click', function () {
        const pid = row.getAttribute('data-project');
        const head = row.getAttribute('data-head');
        renderProjectSummaryDetails(pid, head, `summaryDetails-${pid}`);
      });
    });
  }

  /**
   * Render the approval tab. Allows the admin to review all recorded activities and
   * set their approval status (Sanctioned/Revision/Rejected) with optional
   * remarks. Remarks are mandatory when status is Revision or Rejected. When
   * status is changed to Sanctioned, implementation fields are initialized.
   * @param {HTMLElement} container
   */
  function renderAdminApproval(container) {
    const data = loadData();
    container.innerHTML = '<h3>Activity Approval</h3>';
    // Determine sort icons for approval columns (date, surveyor, head, type)
    const apprIcons = {};
    ['date', 'surveyor', 'head', 'type'].forEach(f => {
      apprIcons[f] = '';
      if (approvalSortField === f) {
        apprIcons[f] = (approvalSortOrder === 'asc' ? ' ▲' : ' ▼');
      }
    });
    // If no activities at all, show message and return
    if (data.activities.length === 0) {
      container.innerHTML += '<p>No activities available for approval.</p>';
      return;
    }
    let foundAny = false;
    // For each project, build a separate approval table
    data.projects.forEach(project => {
      // Filter activities belonging to this project
      let acts = data.activities.filter(a => a.projectId === project.id);
      if (acts.length === 0) return;
      foundAny = true;
      // Clone and sort activities based on approvalSortField and sort order
      acts = acts.slice();
      acts.sort((a, b) => {
        let cmp = 0;
        if (approvalSortField === 'date') {
          cmp = a.timestamp - b.timestamp; // ascending by default (earliest first)
        } else if (approvalSortField === 'surveyor') {
          const survA = data.users.find(u => u.id === a.createdBy);
          const survB = data.users.find(u => u.id === b.createdBy);
          const nameA = survA ? survA.name : '';
          const nameB = survB ? survB.name : '';
          cmp = nameA.localeCompare(nameB);
        } else if (approvalSortField === 'head') {
          cmp = a.head.localeCompare(b.head);
        } else if (approvalSortField === 'type') {
          cmp = a.type.localeCompare(b.type);
        }
        return approvalSortOrder === 'asc' ? cmp : -cmp;
      });
      // Build HTML for this project's approval table.  Wrap the title and
      // download buttons in a flex header so they appear on the same line.
      let html = `<div class="section-header"><h4>${project.title} (${project.code || ''})</h4>`;
      html += `<div class="download-buttons">`;
      html += `<button class="small" data-action="downloadApproval" data-project="${project.id}">Download Excel</button>`;
      // Provide a PDF download instead of an image for approval tables
      html += `<button class="small" data-action="downloadApprovalPdf" data-project="${project.id}">Download PDF</button>`;
      html += `</div></div>`;
      html += `<table id="approval-table-${project.id}"><thead><tr>`;
      // Display date, surveyor, head, type with sorting icons.  The data-field attribute
      // corresponds to the sort key used in approvalSortField.  When a column is
      // clicked, it will toggle the sort order or select a new field.
      html += `<th data-field="date" class="sortable">Date${apprIcons.date}</th>`;
      html += `<th data-field="surveyor" class="sortable">Surveyor${apprIcons.surveyor}</th>`;
      html += `<th data-field="head" class="sortable">Head${apprIcons.head}</th>`;
      html += `<th data-field="type" class="sortable">Type${apprIcons.type}</th>`;
      html += '<th>Qty</th><th>Total</th><th>Net Grant</th><th>Sanctioned At</th><th>Status</th><th>Remarks</th><th>Save</th>';
      html += '</tr></thead><tbody>';
      acts.forEach(act => {
        const dateStr = new Date(act.timestamp).toLocaleDateString();
        const surv = data.users.find(u => u.id === act.createdBy);
        const survName = surv ? surv.name : act.createdBy;
        const status = act.approvalStatus || '';
        const remarks = act.remarks || '';
        const sancStr = (status === 'Sanctioned' && act.sanctionedAt) ? new Date(act.sanctionedAt).toLocaleString() : '';
        html += `<tr data-id="${act.id}">
          <td>${dateStr}</td>
          <td>${survName}</td>
          <td>${act.head}</td>
          <td>${act.type}</td>
          <td>${act.quantity}</td>
          <td>${(act.total != null && !isNaN(act.total)) ? act.total.toFixed(2) : '0.00'}</td>
          <td>${(act.netGrant != null && !isNaN(act.netGrant)) ? act.netGrant.toFixed(2) : '0.00'}</td>
          <td>${sancStr}</td>
          <td>
            <select class="statusSelect">
              <option value="" ${status === '' ? 'selected' : ''}>Pending</option>
              <option value="Sanctioned" ${status === 'Sanctioned' ? 'selected' : ''}>Sanctioned</option>
              <option value="Revision" ${status === 'Revision' ? 'selected' : ''}>Revision</option>
              <option value="Rejected" ${status === 'Rejected' ? 'selected' : ''}>Rejected</option>
            </select>
          </td>
          <td><input type="text" class="remarkInput" value="${remarks.replace(/"/g, '&quot;')}" /></td>
          <td><button class="small" data-action="saveApproval">Save</button></td>
        </tr>`;
      });
      html += '</tbody></table>';
      // Append HTML to container
      const div = document.createElement('div');
      div.innerHTML = html;
      container.appendChild(div);
    });
    if (!foundAny) {
      container.innerHTML += '<p>No activities available for approval.</p>';
    }
    // Attach save handlers
    container.querySelectorAll('button[data-action="saveApproval"]').forEach(btn => {
      btn.addEventListener('click', function () {
        const row = this.closest('tr');
        const actId = row.getAttribute('data-id');
        const statusSel = row.querySelector('.statusSelect');
        const status = statusSel.value;
        const remarkInput = row.querySelector('.remarkInput');
        const remarks = remarkInput.value.trim();
        if ((status === 'Revision' || status === 'Rejected') && !remarks) {
          alert('Remarks are required when activity is Revised or Rejected.');
          return;
        }
        const data = loadData();
        const act = data.activities.find(a => a.id === actId);
        if (!act) return;
        act.approvalStatus = status;
        act.remarks = remarks;
        if (status === 'Sanctioned') {
          act.implTotalReleased = act.implTotalReleased || 0;

          act.implTotalReleased = act.implTotalReleased || 0;
          act.implQtyAchieved = act.implQtyAchieved || 0;
          act.implGrantExpenditure = act.implGrantExpenditure || 0;
          act.implHistory = act.implHistory || [];
          act.sanctionedAt = Date.now();
        }
        saveData(data);
        alert('Status updated successfully.');
        // Re-render approval tab to reflect updated sanction time
        renderAdminApproval(container);
      });
    });

    // Attach download handlers for approval list
    container.querySelectorAll('button[data-action="downloadApproval"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const projId = btn.getAttribute('data-project');
        downloadApprovalList(projId);
      });
    });
    // Attach download handlers for approval PDFs.  When clicked, capture
    // the corresponding approval table and generate a PDF using
    // downloadApprovalPdf().
    container.querySelectorAll('button[data-action="downloadApprovalPdf"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const projId = btn.getAttribute('data-project');
        downloadApprovalPdf(projId);
      });
    });

    // Attach sorting handlers for approval table headers.  When a sortable header is clicked,
    // toggle order if clicking the same field again or set to ascending for a new field.
    container.querySelectorAll('th.sortable').forEach(th => {
      th.addEventListener('click', function () {
        const field = this.getAttribute('data-field');
        if (field) {
          if (approvalSortField === field) {
            approvalSortOrder = (approvalSortOrder === 'asc' ? 'desc' : 'asc');
          } else {
            approvalSortField = field;
            approvalSortOrder = 'asc';
          }
          renderAdminApproval(container);
        }
      });
    });
  }

  /**
   * Render the implementation tab. Shows sanctioned activities per project and
   * allows the admin to record expenditures and achieved quantities. Utilization
   * is computed as total grant expenditure divided by net grant. Each activity
   * row has an Add button to input additional expenditure and quantity achieved.
   * @param {HTMLElement} container
   */
  function renderAdminImplementation(container) {
    const data = loadData();
    container.innerHTML = '<h3>Implementation</h3>';
    // Determine sort icons for implementation.  We use the first column (Activity)
    // to trigger date sorting and the head column to trigger head sorting.  Icons
    // indicate the current sort direction for the active sort field.
    const implIcons = { date: '', head: '' };
    if (implementationSortField === 'date') {
      implIcons.date = (implementationSortOrder === 'asc' ? ' ▲' : ' ▼');
    } else if (implementationSortField === 'head') {
      implIcons.head = (implementationSortOrder === 'asc' ? ' ▲' : ' ▼');
    }
    let foundAny = false;
    data.projects.forEach(project => {
      // Filter sanctioned activities for this project
      const sanctionedActs = data.activities.filter(a => a.projectId === project.id && a.approvalStatus === 'Sanctioned');
      if (sanctionedActs.length === 0) return;
      foundAny = true;
      // Group sanctioned activities by head, type and subhead so that repeated
      // activities (e.g. Farm Bund) appear only once with aggregated figures.
      const grouped = {};
      sanctionedActs.forEach(act => {
        const sub = act.subhead || '';
        const key = `${act.head}||${act.type}||${sub}`;
        if (!grouped[key]) {
          grouped[key] = {
            head: act.head,
            type: act.type,
            subhead: sub,
            quantity: 0,
            total: 0,
            net: 0,
            implReleased: 0,
            implQty: 0,
            implGrant: 0,
            acts: [],
            // earliest sanction date (for sorting by date)
            minDate: act.sanctionedAt || act.timestamp || 0,
            // quarter-specific values
            qtrQty: 0,
            qtrExp: 0
          };
        }
        const g = grouped[key];
        g.head = act.head;
        g.quantity += act.quantity;
        g.total += (act.total != null && !isNaN(act.total) ? act.total : 0);
        g.net += (act.netGrant != null && !isNaN(act.netGrant) ? act.netGrant : 0);
        g.implReleased += (act.implTotalReleased || 0);
        g.implQty += (act.implQtyAchieved || 0);
        g.implGrant += (act.implGrantExpenditure || 0);
        g.acts.push(act);
        // track earliest sanction date for sorting by date
        const actDate = act.sanctionedAt || act.timestamp || 0;
        if (!g.minDate || actDate < g.minDate) g.minDate = actDate;
      });
      // Compute quarter-specific values for each group
      const now = new Date();
      const month = now.getMonth();
      const quarterIndex = month < 3 ? 1 : month < 6 ? 2 : month < 9 ? 3 : 4;
      const quarterStart = new Date(now.getFullYear(), (quarterIndex - 1) * 3, 1).getTime();
      const quarterEnd = new Date(now.getFullYear(), quarterIndex * 3, 0, 23, 59, 59, 999).getTime();
      Object.values(grouped).forEach(g => {
        // reset quarter totals
        g.qtrQty = 0;
        g.qtrExp = 0;
        g.acts.forEach(act => {
          const hist = act.implHistory || [];
          hist.forEach(entry => {
            if (entry.date >= quarterStart && entry.date <= quarterEnd) {
              g.qtrQty += entry.qty;
              g.qtrExp += entry.exp;
            }
          });
        });
      });
      // Sort groups based on selected field
      const keys = Object.keys(grouped);
      keys.sort((a, b) => {
        const gA = grouped[a];
        const gB = grouped[b];
        let cmp = 0;
        if (implementationSortField === 'head') {
          // sort by head alphabetically, then type
          if (gA.head < gB.head) cmp = -1;
          else if (gA.head > gB.head) cmp = 1;
          else {
            if (gA.type < gB.type) cmp = -1;
            else if (gA.type > gB.type) cmp = 1;
            else cmp = 0;
          }
        } else {
          // sort by earliest sanction date
          cmp = (gA.minDate || 0) - (gB.minDate || 0);
        }
        return implementationSortOrder === 'asc' ? cmp : -cmp;
      });
      // Begin project section.  Wrap the title and download buttons in a
      // flex container so they appear on the same line.
      let html = `<div class="section-header"><h4>${project.title} (${project.code || ''})</h4>`;
      html += `<div class="download-buttons">`;
      // Provide two download options: Excel and Image (PNG).
      html += `<button class="small" data-action="downloadImpl" data-project="${project.id}">Download Excel</button>`;
      // Provide a PDF download instead of an image.  The image download is deprecated.
      html += `<button class="small" data-action="downloadImplPdf" data-project="${project.id}">Download PDF</button>`;
      html += `</div></div>`;
      // Table header includes sortable columns for Activity/date and Head. The icons
      // reflect the current sort field and order.  Other columns are static.
      html += `<table id="impl-table-${project.id}"><thead><tr>`;
      html += `<th data-field="date" class="sortable">Activity${implIcons.date}</th>`;
      html += `<th data-field="head" class="sortable">Head${implIcons.head}</th>`;
      html += '<th>Subhead</th><th>Qty</th><th>Total Cost</th><th>Net Grant</th><th>Total Amount Released</th><th>Qty Achieved</th><th>Qty Achieved (Qtr)</th><th>Total Grant Expenditure</th><th>Grant Exp (Qtr)</th><th>Utilization (%)</th><th>History</th><th>Actions</th>';
      html += '</tr></thead><tbody>';
      // Track totals across all grouped rows to build a total row at end
      let totQty = 0;
      let totTotal = 0;
      let totNet = 0;
      let totRel = 0;
      let totAch = 0;
      let totAchQtr = 0;
      let totGrant = 0;
      let totGrantQtr = 0;
      keys.forEach(key => {
        const g = grouped[key];
        totQty += g.quantity;
        totTotal += g.total;
        totNet += g.net;
        totRel += g.implReleased;
        totAch += g.implQty;
        totAchQtr += g.qtrQty;
        totGrant += g.implGrant;
        totGrantQtr += g.qtrExp;
        const util = g.net > 0 ? (g.implGrant / g.net * 100) : 0;
        // Use the first underlying activity ID as reference for add action
        const firstActId = g.acts[0].id;
        html += `<tr data-id="${firstActId}">
          <td>${g.type}</td>
          <td>${g.head}</td>
          <td>${g.subhead}</td>
          <td>${g.quantity}</td>
          <td>${g.total.toFixed(2)}</td>
          <td>${g.net.toFixed(2)}</td>
          <td>${g.implReleased.toFixed(2)}</td>
          <td>${g.implQty}</td>
          <td>${g.qtrQty}</td>
          <td>${g.implGrant.toFixed(2)}</td>
          <td>${g.qtrExp.toFixed(2)}</td>
          <td>${util.toFixed(1)}</td>
          <td><button class="small" data-action="showHist">&hellip;</button></td>
          <td><button class="small" data-action="addExp">Add</button></td>
        </tr>`;
      });
      // Append a total row showing aggregated sums across all sanctioned acts
      const totUtil = totNet > 0 ? (totGrant / totNet * 100) : 0;
      html += `<tr class="total-row" style="font-weight:bold; background:#f8f8f8;">
        <td>Total</td>
        <td></td>
        <td></td>
        <td>${totQty}</td>
        <td>${totTotal.toFixed(2)}</td>
        <td>${totNet.toFixed(2)}</td>
        <td>${totRel.toFixed(2)}</td>
        <td>${totAch}</td>
        <td>${totAchQtr}</td>
        <td>${totGrant.toFixed(2)}</td>
        <td>${totGrantQtr.toFixed(2)}</td>
        <td>${totUtil.toFixed(1)}</td>
        <td></td>
        <td></td>
      </tr>`;
      html += '</tbody></table>';
    });
    if (!foundAny) {
      container.innerHTML += '<p>No sanctioned activities available for implementation.</p>';
    }
    // Attach handlers for history and add expenditure buttons and download implementation
    container.querySelectorAll('button[data-action="showHist"]').forEach(btn => {
      btn.addEventListener('click', function () {
        const row = this.closest('tr');
        const actId = row.getAttribute('data-id');
        const data = loadData();
        const act = data.activities.find(a => a.id === actId);
        if (!act) return;
        const history = act.implHistory || [];
        if (history.length === 0) {
          alert('No expenditure history found.');
          return;
        }
        let msg = 'Expenditure History:\n';
        history.forEach(entry => {
          const dateStr = new Date(entry.date).toLocaleString();
          msg += dateStr + ' - Released: ' + entry.released.toFixed(2) + ', Qty Achieved: ' + entry.qty + ', Grant Exp: ' + entry.exp.toFixed(2) + '\n';
        });
        alert(msg);
      });
    });
    container.querySelectorAll('button[data-action="addExp"]').forEach(btn => {
      btn.addEventListener('click', function () {
        const row = this.closest('tr');
        const actId = row.getAttribute('data-id');
        const data = loadData();
        const act = data.activities.find(a => a.id === actId);
        if (!act) return;
        // Prompt user for new expenditure details
        let amountStr = prompt('Enter amount released (₹):', '0');
        if (amountStr === null) return;
        let amount = parseFloat(amountStr);
        if (isNaN(amount) || amount <= 0) {
          alert('Invalid amount.');
          return;
        }
        let qtyStr = prompt('Enter quantity achieved:', '0');
        if (qtyStr === null) return;
        let qty = parseFloat(qtyStr);
        if (isNaN(qty) || qty < 0) {
          qty = 0;
        }
        let expStr = prompt('Enter grant expenditure (₹):', amount.toString());
        if (expStr === null) return;
        let exp = parseFloat(expStr);
        if (isNaN(exp) || exp < 0) {
          exp = amount;
        }
        // Update the chosen activity; aggregated values will reflect in summary
        act.implTotalReleased = (act.implTotalReleased || 0) + amount;
        act.implQtyAchieved = (act.implQtyAchieved || 0) + qty;
        act.implGrantExpenditure = (act.implGrantExpenditure || 0) + exp;
        // Push a history record with date/time and amounts
        act.implHistory = act.implHistory || [];
        act.implHistory.push({ date: Date.now(), released: amount, qty: qty, exp: exp });
        saveData(data);
        // Re-render implementation tab to reflect updates
        renderAdminImplementation(container);
      });
    });
    // Handle download implementation per project (Excel)
    container.querySelectorAll('button[data-action="downloadImpl"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const projId = btn.getAttribute('data-project');
        downloadImplementationList(projId);
      });
    });
    // Handle PDF download for implementation: capture table as PDF
    container.querySelectorAll('button[data-action="downloadImplPdf"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const projId = btn.getAttribute('data-project');
        downloadImplementationPdf(projId);
      });
    });

    // Attach sorting handlers for implementation table headers.  Clicking a
    // sortable header toggles the order for the existing sort field or
    // selects a new sort field with ascending order.  The 'Activity'
    // column (data-field="date") corresponds to sorting by earliest
    // sanction date.
    container.querySelectorAll('th.sortable').forEach(th => {
      th.addEventListener('click', function () {
        const field = this.getAttribute('data-field');
        if (field) {
          if (implementationSortField === field) {
            implementationSortOrder = (implementationSortOrder === 'asc' ? 'desc' : 'asc');
          } else {
            implementationSortField = field;
            implementationSortOrder = 'asc';
          }
          renderAdminImplementation(container);
        }
      });
    });
  }

  /**
   * Render detailed activities for a given head in the summary tab.
   * Populates the #summaryDetails element with a table of all activities under that head.
   * @param {string} head
   */
  function renderSummaryDetails(head) {
    const detailDiv = document.getElementById('summaryDetails');
    if (!detailDiv) return;
    const data = loadData();
    // Filter activities for selected head
    const acts = data.activities.filter(a => a.head === head);
    if (acts.length === 0) {
      detailDiv.innerHTML = `<p>No activities recorded for ${head}.</p>`;
      return;
    }
    // Aggregate activities for this head across all projects by type and subhead
    const grouped = {};
    acts.forEach(act => {
      const sub = act.subhead || '';
      const key = `${act.type}||${sub}`;
      // compute fallback cost values for this record
      const matT = (act.materialTotal != null)
        ? act.materialTotal
        : (act.quantity * ((act.materialRate != null) ? act.materialRate : 0));
      const unskillT = (act.unskilledTotal != null)
        ? act.unskilledTotal
        : (act.quantity * ((act.unskilledRate != null) ? act.unskilledRate : 0));
      const skillT = (act.skilledTotal != null)
        ? act.skilledTotal
        : (act.quantity * ((act.skilledRate != null) ? act.skilledRate : 0));
      const totT = (act.total != null && !isNaN(act.total)) ? act.total : (matT + unskillT + skillT);
      const contr = (act.contribution != null) ? act.contribution : 0;
      const conv = (act.convergence != null) ? act.convergence : 0;
      const net = (act.netGrant != null) ? act.netGrant : (totT - contr - conv);
      // initialize group if not exists
      if (!grouped[key]) {
        grouped[key] = {
          type: act.type,
          subhead: sub,
          unit: act.unitName || '',
          unskilledRate: act.unskilledRate || 0,
          skilledRate: act.skilledRate || 0,
          materialRate: act.materialRate || 0,
          quantity: 0,
          material: 0,
          unskilled: 0,
          skilled: 0,
          total: 0,
          contribution: 0,
          convergence: 0,
          net: 0,
          count: 0
        };
      }
      const g = grouped[key];
      g.quantity += act.quantity;
      g.material += matT;
      g.unskilled += unskillT;
      g.skilled += skillT;
      g.total += totT;
      g.contribution += contr;
      g.convergence += conv;
      g.net += net;
      g.count += 1;
    });
    let html = `<h4>Details for ${head}</h4>`;
    html += '<table><thead><tr>';
    html += '<th>Type</th><th>Subhead</th><th>Times</th><th>Qty</th><th>Unit</th><th>Material</th><th>Unskilled</th><th>Skilled</th><th>Unit Cost</th><th>Total</th><th>Contribution</th><th>Convergence</th><th>Net</th>';
    html += '</tr></thead><tbody>';
    Object.keys(grouped).forEach(key => {
      const g = grouped[key];
      const unitCost = (g.unskilledRate || 0) + (g.skilledRate || 0) + (g.materialRate || 0);
      html += `<tr>
        <td>${g.type}</td>
        <td>${g.subhead}</td>
        <td>${g.count}</td>
        <td>${g.quantity}</td>
        <td>${g.unit}</td>
        <td>${g.material.toFixed(2)}</td>
        <td>${g.unskilled.toFixed(2)}</td>
        <td>${g.skilled.toFixed(2)}</td>
        <td>${unitCost.toFixed(2)}</td>
        <td>${g.total.toFixed(2)}</td>
        <td>${g.contribution.toFixed(2)}</td>
        <td>${g.convergence.toFixed(2)}</td>
        <td>${g.net.toFixed(2)}</td>
      </tr>`;
    });
    html += '</tbody></table>';
    detailDiv.innerHTML = html;
  }

  /**
   * Render detailed activities for a given project and head. This populates
   * the specified details container with a table of activities filtered by
   * project ID and head. It reuses the cost breakdown columns used in
   * summary tables.
   * @param {string} projectId
   * @param {string} head
   * @param {string} containerId
   */
  function renderProjectSummaryDetails(projectId, head, containerId) {
    const detailDiv = document.getElementById(containerId);
    if (!detailDiv) return;
    const data = loadData();
    // Filter activities for selected project and head
    const acts = data.activities.filter(a => a.projectId === projectId && a.head === head);
    if (acts.length === 0) {
      detailDiv.innerHTML = `<p>No activities recorded for ${head} in this project.</p>`;
      return;
    }
    // Aggregate activities by type and subhead
    const grouped = {};
    acts.forEach(act => {
      // derive grouping key by type and subhead to collate similar activities
      const sub = act.subhead || '';
      const key = `${act.type}||${sub}`;
      // compute fallback cost values for this record
      const matT = (act.materialTotal != null)
        ? act.materialTotal
        : (act.quantity * ((act.materialRate != null) ? act.materialRate : 0));
      const unskillT = (act.unskilledTotal != null)
        ? act.unskilledTotal
        : (act.quantity * ((act.unskilledRate != null) ? act.unskilledRate : 0));
      const skillT = (act.skilledTotal != null)
        ? act.skilledTotal
        : (act.quantity * ((act.skilledRate != null) ? act.skilledRate : 0));
      const totT = (act.total != null && !isNaN(act.total)) ? act.total : (matT + unskillT + skillT);
      const contr = (act.contribution != null) ? act.contribution : 0;
      const conv = (act.convergence != null) ? act.convergence : 0;
      const net = (act.netGrant != null) ? act.netGrant : (totT - contr - conv);
      // initialize group if not exists
      if (!grouped[key]) {
        grouped[key] = {
          type: act.type,
          subhead: sub,
          unit: act.unitName || '',
          unskilledRate: act.unskilledRate || 0,
          skilledRate: act.skilledRate || 0,
          materialRate: act.materialRate || 0,
          quantity: 0,
          material: 0,
          unskilled: 0,
          skilled: 0,
          total: 0,
          contribution: 0,
          convergence: 0,
          net: 0,
          count: 0
        };
      }
      const g = grouped[key];
      g.quantity += act.quantity;
      g.material += matT;
      g.unskilled += unskillT;
      g.skilled += skillT;
      g.total += totT;
      g.contribution += contr;
      g.convergence += conv;
      g.net += net;
      g.count += 1;
    });
    let html = `<h5>Details for ${head}</h5>`;
    html += '<table><thead><tr>';
    // aggregated list: omit project, surveyor, beneficiary, village, date columns
    html += '<th>Type</th><th>Subhead</th><th>Times</th><th>Qty</th><th>Unit</th><th>Material</th><th>Unskilled</th><th>Skilled</th><th>Unit Cost</th><th>Total</th><th>Contribution</th><th>Convergence</th><th>Net</th>';
    html += '</tr></thead><tbody>';
    Object.keys(grouped).forEach(key => {
      const g = grouped[key];
      const unitCost = (g.unskilledRate || 0) + (g.skilledRate || 0) + (g.materialRate || 0);
      html += `<tr>
        <td>${g.type}</td>
        <td>${g.subhead}</td>
        <td>${g.count}</td>
        <td>${g.quantity}</td>
        <td>${g.unit}</td>
        <td>${g.material.toFixed(2)}</td>
        <td>${g.unskilled.toFixed(2)}</td>
        <td>${g.skilled.toFixed(2)}</td>
        <td>${unitCost.toFixed(2)}</td>
        <td>${g.total.toFixed(2)}</td>
        <td>${g.contribution.toFixed(2)}</td>
        <td>${g.convergence.toFixed(2)}</td>
        <td>${g.net.toFixed(2)}</td>
      </tr>`;
    });
    html += '</tbody></table>';
    detailDiv.innerHTML = html;
  }

  /**
   * Generate and trigger a download of a CSV summarizing a project's cost analysis
   * and listing all associated activities. The CSV is built on the fly in
   * memory and offered via a data URI.
   * @param {string} projectId
   */
  function downloadProjectSummary(projectId) {
    const data = loadData();
    const project = data.projects.find(p => p.id === projectId);
    if (!project) {
      alert('Project not found');
      return;
    }

    /**
     * Capture the summary table for a given project and download it as a PNG image.
     * Uses html2canvas.  The table is identified by id `summary-table-<projectId>`.
     * The filename includes the project code and "summary".
     * @param {string} projectId
     */
    function downloadSummaryImage(projectId) {
      try {
        const table = document.getElementById(`summary-table-${projectId}`);
        if (!table) {
          alert('Summary table not found');
          return;
        }
        function captureAndDownload() {
          html2canvas(table).then(canvas => {
            const dataURL = canvas.toDataURL('image/png');
            const link = document.createElement('a');
            const project = loadData().projects.find(p => p.id === projectId);
            const code = project ? (project.code || 'project') : 'project';
            link.download = `${code}-summary.png`;
            link.href = dataURL;
            link.click();
          });
        }
        if (typeof html2canvas === 'undefined') {
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
          script.onload = captureAndDownload;
          document.body.appendChild(script);
        } else {
          captureAndDownload();
        }
      } catch (e) {
        console.error('Failed to capture summary table:', e);
        alert('Failed to download image.');
      }
    }

    /**
     * Capture the summary table for a given project and download it as a PDF.
     * Uses html2canvas and jsPDF.  The table is identified by id
     * `summary-table-<projectId>`.  The filename includes the project code
     * and "summary.pdf".
     * @param {string} projectId
     */
    function downloadSummaryPdf(projectId) {
      try {
        const table = document.getElementById(`summary-table-${projectId}`);
        if (!table) {
          alert('Summary table not found');
          return;
        }
        function captureAndPdf() {
          html2canvas(table).then(canvas => {
            function exportPdf() {
              const { jsPDF } = window.jspdf;
              const pdf = new jsPDF('l', 'pt', 'a4');
              const imgData = canvas.toDataURL('image/png');
              const pdfWidth = pdf.internal.pageSize.getWidth();
              const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
              pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
              const project = loadData().projects.find(p => p.id === projectId);
              const code = project ? (project.code || 'project') : 'project';
              pdf.save(`${code}-summary.pdf`);
            }
            if (typeof window.jspdf === 'undefined' || !window.jspdf.jsPDF) {
              const script = document.createElement('script');
              script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
              script.onload = exportPdf;
              document.body.appendChild(script);
            } else {
              exportPdf();
            }
          });
        }
        if (typeof html2canvas === 'undefined') {
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
          script.onload = captureAndPdf;
          document.body.appendChild(script);
        } else {
          captureAndPdf();
        }
      } catch (e) {
        console.error('Failed to capture summary table:', e);
        alert('Failed to download PDF.');
      }
    }
    // Compute per-head totals
    const totals = {};
    HEADS.forEach(h => {
      totals[h] = { material: 0, unskilled: 0, skilled: 0, total: 0, contribution: 0, net: 0 };
    });
    data.activities.forEach(act => {
      if (act.projectId !== projectId) return;
      const t = totals[act.head];
      if (!t) return;
      // compute breakdown on the fly if missing
      const matT = (act.materialTotal != null)
        ? act.materialTotal
        : (act.quantity * ((act.materialRate != null) ? act.materialRate : 0));
      const unskillT = (act.unskilledTotal != null)
        ? act.unskilledTotal
        : (act.quantity * ((act.unskilledRate != null) ? act.unskilledRate : 0));
      const skillT = (act.skilledTotal != null)
        ? act.skilledTotal
        : (act.quantity * ((act.skilledRate != null) ? act.skilledRate : 0));
      const totT = (act.total != null && !isNaN(act.total)) ? act.total : (matT + unskillT + skillT);
      const contr = (act.contribution != null) ? act.contribution : 0;
      const conv = (act.convergence != null) ? act.convergence : 0;
      const net = (act.netGrant != null) ? act.netGrant : (totT - contr - conv);
      t.material += matT;
      t.unskilled += unskillT;
      t.skilled += skillT;
      t.total += totT;
      t.contribution += contr;
      t.net += net;
    });
    let grandTotal = 0;
    HEADS.forEach(h => { grandTotal += totals[h].total; });
    // Build CSV content
    let csv = '';
    csv += `Project,"${project.title}",Code,${project.code || ''}\n`;
    csv += '\nSummary by Head\n';
    csv += 'Head,Material,Unskilled,Skilled,Total,Contribution,Net,Cap %,Utilization %\n';
    const caps = { NRM: 42.5, Climate: 27.5, Livelihood: 7.5, Training: 5, Management: 17.5 };
    HEADS.forEach(h => {
      const util = grandTotal > 0 ? (totals[h].total / grandTotal * 100) : 0;
      csv += `${h},${totals[h].material.toFixed(2)},${totals[h].unskilled.toFixed(2)},${totals[h].skilled.toFixed(2)},${totals[h].total.toFixed(2)},${totals[h].contribution.toFixed(2)},${totals[h].net.toFixed(2)},${caps[h]},${util.toFixed(1)}\n`;
    });
    // Compute aggregated totals across heads.  We use these values to
    // produce a comprehensive total row that mirrors the summary table in
    // the UI.  Without this aggregation the CSV would list only the grand
    // total of cost, leaving material, labour and net fields blank.
    let aggMat = 0;
    let aggUns = 0;
    let aggSkl = 0;
    let aggTot = 0;
    let aggCon = 0;
    let aggNet = 0;
    HEADS.forEach(h => {
      aggMat += totals[h].material;
      aggUns += totals[h].unskilled;
      aggSkl += totals[h].skilled;
      aggTot += totals[h].total;
      aggCon += totals[h].contribution;
      aggNet += totals[h].net;
    });
    // Write the total row with aggregated values across all heads.  The
    // Cap and Utilisation fields are omitted because they do not apply
    // to aggregated data.
    csv += `Total,${aggMat.toFixed(2)},${aggUns.toFixed(2)},${aggSkl.toFixed(2)},${aggTot.toFixed(2)},${aggCon.toFixed(2)},${aggNet.toFixed(2)},,\n`;
    csv += '\nActivity Details\n';
    // Activity details header.  Place the Unit Cost column after the individual
    // cost components to mirror the UI table ordering.
    csv += 'Date,Surveyor,Head,Type,Subhead,Beneficiary,Village,Lat,Lon,Qty,Unit,Unit Cost,Total,Contribution,Convergence,Net Grant\n';
    data.activities.forEach(act => {
      if (act.projectId !== projectId) return;
      const surv = data.users.find(u => u.id === act.createdBy);
      const survName = surv ? surv.name : '';
      const bene = data.beneficiaries.find(b => b.id === act.beneficiaryId);
      const beneName = bene ? bene.name : '';
      const village = bene ? bene.village : '';
      const dateStr = new Date(act.timestamp).toLocaleDateString();
      // separate quantity and unit
      const qtyNum = act.quantity;
      const unitName = act.unitName || '';
      const sub = act.subhead || '';
      // compute fallback breakdown for old activities
      const matT = (act.materialTotal != null)
        ? act.materialTotal
        : (act.quantity * ((act.materialRate != null) ? act.materialRate : 0));
      const unskillT = (act.unskilledTotal != null)
        ? act.unskilledTotal
        : (act.quantity * ((act.unskilledRate != null) ? act.unskilledRate : 0));
      const skillT = (act.skilledTotal != null)
        ? act.skilledTotal
        : (act.quantity * ((act.skilledRate != null) ? act.skilledRate : 0));
      const totT = (act.total != null && !isNaN(act.total)) ? act.total : (matT + unskillT + skillT);
      const contr = (act.contribution != null) ? act.contribution : 0;
      const conv = (act.convergence != null) ? act.convergence : 0;
      const net = (act.netGrant != null) ? act.netGrant : (totT - contr - conv);
      // Calculate unit cost as sum of unit rates (may be undefined for older records)
      const unitCost = ((act.unskilledRate || 0) + (act.skilledRate || 0) + (act.materialRate || 0));
      csv += `${dateStr},${survName},${act.head},${act.type},${sub},${beneName},${village},${qtyNum},${unitName},${matT.toFixed(2)},${unskillT.toFixed(2)},${skillT.toFixed(2)},${unitCost.toFixed(2)},${totT.toFixed(2)},${contr.toFixed(2)},${conv.toFixed(2)},${net.toFixed(2)}\n`;
    });
    // Create a blob and trigger download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    // Use project title and timestamp for filename
    const safeTitle = project.title.replace(/[^a-zA-Z0-9-_]+/g, '_');
    link.setAttribute('download', `${safeTitle}_summary.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Generate and trigger a download of a CSV containing the approval list for
   * a specific project. The CSV will include all activities for the given
   * project, regardless of status, and will capture sanction timestamp and
   * remarks. This mirrors the data shown in the approval tab.
   * @param {string} projectId
   */
  function downloadApprovalList(projectId) {
    const data = loadData();
    const project = data.projects.find(p => p.id === projectId);
    if (!project) {
      alert('Project not found');
      return;
    }

    /**
     * Capture the approval table for a given project and download it as a PNG image.
     * Uses html2canvas.  The table is identified by the id pattern
     * `approval-table-<projectId>`.  The downloaded filename includes the
     * project code and "approval".
     * @param {string} projectId
     */
    function downloadApprovalImage(projectId) {
      try {
        const table = document.getElementById(`approval-table-${projectId}`);
        if (!table) {
          alert('Approval table not found');
          return;
        }
        function captureAndDownload() {
          html2canvas(table).then(canvas => {
            const dataURL = canvas.toDataURL('image/png');
            const link = document.createElement('a');
            const project = loadData().projects.find(p => p.id === projectId);
            const code = project ? (project.code || 'project') : 'project';
            link.download = `${code}-approval.png`;
            link.href = dataURL;
            link.click();
          });
        }
        if (typeof html2canvas === 'undefined') {
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
          script.onload = captureAndDownload;
          document.body.appendChild(script);
        } else {
          captureAndDownload();
        }
      } catch (e) {
        console.error('Failed to capture approval table:', e);
        alert('Failed to download image.');
      }
    }

    /**
     * Capture the approval table for a given project and download it as a PDF.
     * Uses html2canvas and jsPDF. The table is identified by id
     * `approval-table-<projectId>`. The filename includes the project code
     * and "approval.pdf".
     * @param {string} projectId
     */
    function downloadApprovalPdf(projectId) {
      try {
        const table = document.getElementById(`approval-table-${projectId}`);
        if (!table) {
          alert('Approval table not found');
          return;
        }
        function captureAndPdf() {
          html2canvas(table).then(canvas => {
            function exportPdf() {
              const { jsPDF } = window.jspdf;
              const pdf = new jsPDF('l', 'pt', 'a4');
              const imgData = canvas.toDataURL('image/png');
              const pdfWidth = pdf.internal.pageSize.getWidth();
              const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
              pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
              const project = loadData().projects.find(p => p.id === projectId);
              const code = project ? (project.code || 'project') : 'project';
              pdf.save(`${code}-approval.pdf`);
            }
            if (typeof window.jspdf === 'undefined' || !window.jspdf.jsPDF) {
              const script = document.createElement('script');
              script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
              script.onload = exportPdf;
              document.body.appendChild(script);
            } else {
              exportPdf();
            }
          });
        }
        if (typeof html2canvas === 'undefined') {
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
          script.onload = captureAndPdf;
          document.body.appendChild(script);
        } else {
          captureAndPdf();
        }
      } catch (e) {
        console.error('Failed to capture approval table:', e);
        alert('Failed to download PDF.');
      }
    }
    // Filter activities for this project
    const acts = data.activities.filter(a => a.projectId === projectId);
    if (acts.length === 0) {
      alert('No activities found for this project');
      return;
    }
    // Build CSV content
    let csv = '';
    csv += `Project,"${project.title}",Code,${project.code || ''}\n`;
    csv += '\nApproval List\n';
    csv += 'Date,Surveyor,Head,Type,Subhead,Quantity,Unit,Total,Net Grant,Sanctioned At,Status,Remarks\n';
    acts.forEach(act => {
      const dateStr = new Date(act.timestamp).toLocaleDateString();
      const surv = data.users.find(u => u.id === act.createdBy);
      const survName = surv ? surv.name : '';
      const sub = act.subhead || '';
      const unit = act.unitName || '';
      const total = (act.total != null && !isNaN(act.total)) ? act.total : 0;
      const contr = (act.contribution != null) ? act.contribution : 0;
      const conv = (act.convergence != null) ? act.convergence : 0;
      const net = (act.netGrant != null) ? act.netGrant : (total - contr - conv);
      const sancStr = (act.approvalStatus === 'Sanctioned' && act.sanctionedAt) ? new Date(act.sanctionedAt).toLocaleString() : '';
      const remarks = act.remarks ? act.remarks.replace(/"/g, '""') : '';
      csv += `${dateStr},${survName},${act.head},${act.type},${sub},${act.quantity},${unit},${total.toFixed(2)},${net.toFixed(2)},${sancStr},${act.approvalStatus || ''},"${remarks}"\n`;
    });
    // Trigger download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const safeTitle = project.title.replace(/[^a-zA-Z0-9-_]+/g, '_');
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    link.setAttribute('download', `${safeTitle}_approval_${ts}.csv`);
    link.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Generate and trigger a download of a CSV containing implementation data for
   * a specific project. This file lists aggregated sanctioned activities by
   * head/type/subhead along with total, net, released, achieved quantities,
   * quarterly achievements, grant expenditures, and utilization. A totals row
   * is appended at the bottom.
   * @param {string} projectId
   */
  function downloadImplementationList(projectId) {
    const data = loadData();
    const project = data.projects.find(p => p.id === projectId);
    if (!project) {
      alert('Project not found');
      return;
    }
    const sanctionedActs = data.activities.filter(a => a.projectId === projectId && a.approvalStatus === 'Sanctioned');
    if (sanctionedActs.length === 0) {
      alert('No sanctioned activities for this project');
      return;
    }
    // Group by head/type/subhead
    const grouped = {};
    sanctionedActs.forEach(act => {
      const sub = act.subhead || '';
      const key = `${act.head}||${act.type}||${sub}`;
      if (!grouped[key]) {
        grouped[key] = {
          head: act.head,
          type: act.type,
          subhead: sub,
          quantity: 0,
          total: 0,
          net: 0,
          released: 0,
          ach: 0,
          achQtr: 0,
          grant: 0,
          grantQtr: 0
        };
      }
      const g = grouped[key];
      g.quantity += act.quantity;
      g.total += (act.total != null && !isNaN(act.total) ? act.total : 0);
      const contr = (act.contribution != null) ? act.contribution : 0;
      const conv = (act.convergence != null) ? act.convergence : 0;
      const netV = (act.netGrant != null && !isNaN(act.netGrant)) ? act.netGrant : (g.total - contr - conv);
      g.net += netV;
      g.released += (act.implTotalReleased || 0);
      g.ach += (act.implQtyAchieved || 0);
      g.grant += (act.implGrantExpenditure || 0);
      // Quarter sums computed from implHistory
      const now = new Date();
      const month = now.getMonth();
      const quarterIndex = month < 3 ? 1 : month < 6 ? 2 : month < 9 ? 3 : 4;
      const quarterStart = new Date(now.getFullYear(), (quarterIndex - 1) * 3, 1).getTime();
      const quarterEnd = new Date(now.getFullYear(), quarterIndex * 3, 0, 23, 59, 59, 999).getTime();
      const hist = act.implHistory || [];
      hist.forEach(entry => {
        if (entry.date >= quarterStart && entry.date <= quarterEnd) {
          g.achQtr += entry.qty;
          g.grantQtr += entry.exp;
        }
      });
    });
    // Compute totals for aggregated row
    let totQty = 0;
    let totTotal = 0;
    let totNet = 0;
    let totRel = 0;
    let totAch = 0;
    let totAchQtr = 0;
    let totGrant = 0;
    let totGrantQtr = 0;
    const lines = [];
    // Build CSV lines for each grouped row
    for (const key in grouped) {
      const g = grouped[key];
      totQty += g.quantity;
      totTotal += g.total;
      totNet += g.net;
      totRel += g.released;
      totAch += g.ach;
      totAchQtr += g.qtrQty;
      totGrant += g.implGrant;
      totGrantQtr += g.qtrExp;
      const util = g.net > 0 ? (g.grant / g.net * 100) : 0;
      lines.push([
        g.type,
        g.head,
        g.subhead,
        g.quantity,
        g.total.toFixed(2),
        g.net.toFixed(2),
        g.released.toFixed(2),
        g.ach,
        g.achQtr,
        g.grant.toFixed(2),
        g.grantQtr.toFixed(2),
        util.toFixed(1)
      ]);
    }
    const totUtil = totNet > 0 ? (totGrant / totNet * 100) : 0;
    // Build CSV
    let csv = '';
    csv += `Project,"${project.title}",Code,${project.code || ''}\n`;
    csv += '\nImplementation Summary\n';
    csv += 'Activity,Head,Subhead,Qty,Total Cost,Net Grant,Total Amount Released,Qty Achieved,Qty Achieved (Qtr),Total Grant Expenditure,Grant Exp (Qtr),Utilization (%)\n';
    lines.forEach(line => {
      csv += line.join(',') + '\n';
    });
    // Append totals row
    csv += `Total,, ,${totQty},${totTotal.toFixed(2)},${totNet.toFixed(2)},${totRel.toFixed(2)},${totAch},${totAchQtr},${totGrant.toFixed(2)},${totGrantQtr.toFixed(2)},${totUtil.toFixed(1)}\n`;
    // Trigger download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const safeTitle = project.title.replace(/[^a-zA-Z0-9-_]+/g, '_');
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    link.setAttribute('download', `${safeTitle}_implementation_${ts}.csv`);
    link.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Generate a CSV (Excel-compatible) of all activities for a given project.
   * The CSV includes date, surveyor name, head, type, subhead, beneficiary,
   * village (blank for non-NRM heads), latitude, longitude, quantity, unit,
   * unit cost, total cost, contribution, convergence, and net grant.  The
   * resulting file is named after the project code and "activities" with
   * a timestamp.
   * @param {string} projectId
   */
  function downloadActivitiesList(projectId) {
    const data = loadData();
    const project = data.projects.find(p => p.id === projectId);
    if (!project) {
      alert('Project not found');
      return;
    }
    const acts = data.activities.filter(a => a.projectId === projectId);
    if (acts.length === 0) {
      alert('No activities recorded for this project');
      return;
    }
    let csv = '';
    csv += `Project,"${project.title}",Code,${project.code || ''}\n`;
    csv += '\nActivity List\n';
    csv += 'Date,Surveyor,Head,Type,Subhead,Beneficiary,Village,Lat,Lon,Qty,Unit,Unit Cost,Total,Contribution,Convergence,Net Grant\n';
    acts.forEach(act => {
      const dateStr = new Date(act.timestamp).toLocaleDateString();
      const surv = data.users.find(u => u.id === act.createdBy);
      const survName = surv ? surv.name : '';
      const sub = act.subhead || '';
      const bene = data.beneficiaries.find(b => b.id === act.beneficiaryId);
      const beneName = bene ? bene.name : '';
      const village = bene ? bene.village : '';
      const lat = act.lat || '';
      const lon = act.lon || '';
      const qty = act.quantity;
      const unit = act.unitName || '';
      const unitCost = ((act.unskilledRate || 0) + (act.skilledRate || 0) + (act.materialRate || 0));
      const total = (act.total != null && !isNaN(act.total)) ? act.total : 0;
      const contr = (act.contribution != null) ? act.contribution : 0;
      const conv = (act.convergence != null) ? act.convergence : 0;
      const net = (act.netGrant != null) ? act.netGrant : (total - contr - conv);
      csv += `${dateStr},${survName},${act.head},${act.type},${sub},${beneName},${village},${lat},${lon},${qty},${unit},${unitCost.toFixed(2)},${total.toFixed(2)},${contr.toFixed(2)},${conv.toFixed(2)},${net.toFixed(2)}\n`;
    });
    // Create a blob and trigger download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    // Use project title and timestamp for filename
    const safeTitle = project.title.replace(/[^a-zA-Z0-9-_]+/g, '_');
    link.setAttribute('download', `${safeTitle}_activities_${ts}.csv`);
    link.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Capture the activities table for a given project and download it as a PDF.
   * Uses html2canvas and jsPDF.  The table should have id
   * `activities-table-<projectId>` and include all activities for that
   * project.  The downloaded filename uses the project code and
   * "activities.pdf".  Requires html2canvas and jsPDF; they will be
   * loaded on demand if not already present.
   * @param {string} projectId
   */
  function downloadActivitiesPdf(projectId) {
    try {
      const table = document.getElementById(`activities-table-${projectId}`);
      if (!table) {
        alert('Activities table not found');
        return;
      }
      function captureAndPdf() {
        html2canvas(table).then(canvas => {
          function exportPdf() {
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF('l', 'pt', 'a4');
            const imgData = canvas.toDataURL('image/png');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            const project = loadData().projects.find(p => p.id === projectId);
            const code = project ? (project.code || 'project') : 'project';
            pdf.save(`${code}-activities.pdf`);
          }
          if (typeof window.jspdf === 'undefined' || !window.jspdf.jsPDF) {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
            script.onload = exportPdf;
            document.body.appendChild(script);
          } else {
            exportPdf();
          }
        });
      }
      if (typeof html2canvas === 'undefined') {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
        script.onload = captureAndPdf;
        document.body.appendChild(script);
      } else {
        captureAndPdf();
      }
    } catch (e) {
      console.error('Failed to capture activities table:', e);
      alert('Failed to download PDF.');
    }
  }

  /**
   * Capture the implementation table for a given project and download it as a PDF.
   * Uses html2canvas and jsPDF.  The table is identified by the id
   * pattern `impl-table-<projectId>`.  The downloaded filename includes
   * the project code and "implementation.pdf".
   * @param {string} projectId
   */
  function downloadImplementationPdf(projectId) {
    try {
      const table = document.getElementById(`impl-table-${projectId}`);
      if (!table) {
        alert('Implementation table not found');
        return;
      }
      // Helper to generate the PDF once both libraries are loaded
      function captureAndPdf() {
        html2canvas(table).then(canvas => {
          // Ensure jsPDF is available
          function exportPdf() {
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF('l', 'pt', 'a4');
            const imgData = canvas.toDataURL('image/png');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            const project = loadData().projects.find(p => p.id === projectId);
            const code = project ? (project.code || 'project') : 'project';
            pdf.save(`${code}-implementation.pdf`);
          }
          if (typeof window.jspdf === 'undefined' || !window.jspdf.jsPDF) {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
            script.onload = exportPdf;
            document.body.appendChild(script);
          } else {
            exportPdf();
          }
        });
      }
      // Ensure html2canvas is available
      if (typeof html2canvas === 'undefined') {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
        script.onload = captureAndPdf;
        document.body.appendChild(script);
      } else {
        captureAndPdf();
      }
    } catch (e) {
      console.error('Failed to capture implementation table:', e);
      alert('Failed to download PDF.');
    }
  }


  /**
   * Capture the implementation table for a given project and download it as a PNG image.
   * This uses the html2canvas library, which must be loaded in index.html.  The table
   * is identified by the id pattern `impl-table-<projectId>`.  The resulting image
   * is downloaded with a filename incorporating the project code.
   * @param {string} projectId
   */
  function downloadImplementationImage(projectId) {
    try {
      const table = document.getElementById(`impl-table-${projectId}`);
      if (!table) {
        alert('Implementation table not found');
        return;
      }
      // This legacy function captured a PNG; it remains for backward compatibility
      // but is no longer used.  Implementation downloads now provide a PDF option
      // via downloadImplementationPdf().
      function captureAndDownload() {
        html2canvas(table).then(canvas => {
          const dataURL = canvas.toDataURL('image/png');
          const link = document.createElement('a');
          const project = loadData().projects.find(p => p.id === projectId);
          const code = project ? (project.code || 'project') : 'project';
          link.download = `${code}-implementation.png`;
          link.href = dataURL;
          link.click();
        });
      }
      if (typeof html2canvas === 'undefined') {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
        script.onload = captureAndDownload;
        document.body.appendChild(script);
      } else {
        captureAndDownload();
      }
    } catch (e) {
      console.error('Failed to capture implementation table:', e);
      alert('Failed to download image.');
    }
  }

  /**
   * Delete a project and remove all related assignments and activities.
   * This helper is called when an admin deletes a project from the Projects tab.
   * @param {string} projectId
   */
  function deleteProjectAndRelated(projectId) {
    const data = loadData();
    // Remove the project entry
    data.projects = data.projects.filter(p => p.id !== projectId);
    // Remove assignments referencing this project
    data.assignments = data.assignments.filter(a => a.projectId !== projectId);
    // Remove activities referencing this project
    data.activities = data.activities.filter(a => a.projectId !== projectId);
    saveData(data);
  }

  /**
   * Delete a single activity by ID.
   * Used by admin activities page to remove erroneous or duplicate entries.
   * @param {string} activityId
   */
  function deleteActivityById(activityId) {
    const data = loadData();
    data.activities = data.activities.filter(a => a.id !== activityId);
    saveData(data);
  }

  /*
    ================================
      Surveyor Interface
    ================================
  */

  /**
   * Show the surveyor page with forms to add activities and view their own records.
   * @param {Object} session
   */
  function showSurveyorPage(session) {
    app.innerHTML = '';
    const data = loadData();
    // Header
    const header = createElement(`
      <header>
        <h2>Surveyor Dashboard</h2>
        <div class="user-info">
          Logged in as ${session.name} (<em>${session.username}</em>)
          <button id="logoutBtn" class="secondary small" style="margin-left:15px;">Logout</button>
        </div>
      </header>
    `);
    app.appendChild(header);
    header.querySelector('#logoutBtn').addEventListener('click', () => {
      clearSession();
      render();
    });

    // Insert dark mode toggle into the surveyor header
    const userInfoContainer2 = header.querySelector('.user-info');
    initDarkModeToggle(userInfoContainer2);
    // Main content
    const content = document.createElement('div');
    content.innerHTML = `
      <h3>Add Activity</h3>
      <form id="activityForm">
        <div class="row">
          <div>
            <label>Project</label>
            <select id="actProject" required></select>
          </div>
          <div>
            <label>Head</label>
            <select id="actHead" required>
              ${HEADS.map(h => `<option value="${h}">${h}</option>`).join('')}
            </select>
          </div>
          <!-- Subhead container will appear only for Climate head -->
          <div id="subheadContainer" style="display:none;">
            <label>Subhead</label>
            <select id="actSubhead"></select>
          </div>
        </div>
        <div class="row">
          <div>
            <label>Activity Type</label>
            <select id="actType" required></select>
          </div>
          <div>
            <label>Unit</label>
            <input type="text" id="actUnit" readonly />
          </div>
          <div>
            <label>Quantity</label>
            <input type="number" id="actQuantity" min="0" step="0.01" required />
          </div>
          <div>
            <label>Plot No.</label>
            <input type="text" id="actPlot" />
          </div>
        </div>
        <div class="row">
          <div>
            <label>Beneficiary Name</label>
            <!-- Initially optional; requirement toggled based on head selection -->
            <input type="text" id="actBeneName" />
          </div>
          <div>
            <label>Beneficiary Phone</label>
            <input type="text" id="actBenePhone" />
          </div>
          <div>
            <label>Village</label>
            <!-- Changed to select dropdown. Options populated based on selected project. Requirement toggled via script. -->
            <select id="actVillage"></select>
          </div>
          <div>
            <label>Beneficiary Type</label>
            <select id="actBeneType" required>
              <option value="Individual">Individual</option>
              <option value="Public">Public</option>
            </select>
          </div>
        </div>
        <div class="row">
          <div>
            <label>Latitude</label>
            <input type="number" id="actLat" step="0.000001" />
          </div>
          <div>
            <label>Longitude</label>
            <input type="number" id="actLon" step="0.000001" />
          </div>
          <div style="display:flex; align-items:flex-end; padding-top:6px;">
            <button type="button" id="locBtn" class="small">Use Current Location</button>
          </div>
        </div>
        <!-- Optional convergence input: additional cost not covered by material/skilled/unskilled -->
        <div class="row">
          <div>
            <label>Convergence (optional)</label>
            <input type="number" id="actConvergence" min="0" step="0.01" placeholder="0" />
          </div>
        </div>

        <!-- Photo evidence input: allow multiple images to be attached to this activity.  Photos
             are read locally and stored as data URIs when the form is submitted. -->
        <div class="row">
          <div>
            <label>Photos (optional)</label>
            <input type="file" id="actPhotos" accept="image/*" multiple />
          </div>
        </div>
        <div class="row" id="computedCosts" style="margin-top:10px; display:none;">
          <div>
            <label>Total Cost</label>
            <input type="text" id="actTotal" readonly />
          </div>
          <div>
            <label>Contribution</label>
            <input type="text" id="actContribution" readonly />
          </div>
          <div>
            <label>Net Grant</label>
            <input type="text" id="actNetGrant" readonly />
          </div>
        </div>
        <button type="submit">Save Activity</button>
      </form>
      <h3 style="margin-top:40px;">My Activities</h3>
      <div id="myActivityList"></div>
      <h3 style="margin-top:40px;">Project Summary</h3>
      <div class="row">
        <div>
          <label>Select Project</label>
          <select id="survProjSelect"></select>
        </div>
      </div>
      <div id="survProjSummary" style="margin-top:10px;"></div>
    `;
    app.appendChild(content);
    // Populate project select with assignments for this surveyor
    const projectSelect = document.getElementById('actProject');
    const assignments = data.assignments.filter(a => a.surveyorId === session.id);
    assignments.forEach(a => {
      const proj = data.projects.find(p => p.id === a.projectId);
      if (proj) {
        const option = document.createElement('option');
        option.value = proj.id;
        option.textContent = proj.title;
        projectSelect.appendChild(option);
      }
    });
    if (assignments.length === 0) {
      projectSelect.innerHTML = '<option value="" disabled>No projects assigned</option>';
    }
    // Populate village options based on selected project
    function refreshVillages() {
      const villageSelect = document.getElementById('actVillage');
      if (!villageSelect) return;
      villageSelect.innerHTML = '';
      // Always include a default option to allow clearing village selection
      const defOpt = document.createElement('option');
      defOpt.value = '';
      defOpt.textContent = 'Select Village';
      villageSelect.appendChild(defOpt);
      const proj = data.projects.find(p => p.id === projectSelect.value);
      if (proj && Array.isArray(proj.villages) && proj.villages.length) {
        proj.villages.forEach(v => {
          const opt = document.createElement('option');
          opt.value = v;
          opt.textContent = v;
          villageSelect.appendChild(opt);
        });
      }
      // If there are no defined villages, the select will only have the default option
    }
    // Bind change handler to project select to refresh villages
    projectSelect.addEventListener('change', refreshVillages);
    // Initial refresh of villages after projects are populated
    refreshVillages();

    // Attempt to pre-fill latitude and longitude automatically if browser grants permission.
    // This runs once on page load and simply sets the lat/lon inputs if available.
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          const latInput = document.getElementById('actLat');
          const lonInput = document.getElementById('actLon');
          if (latInput && lonInput) {
            latInput.value = pos.coords.latitude.toFixed(6);
            lonInput.value = pos.coords.longitude.toFixed(6);
          }
        },
        function (err) {
          // If user denies or an error occurs, simply ignore and let the manual button be used.
        }
      );
    }
    // Populate activity type select based on head
    const typeSelect = document.getElementById('actType');
    const headSelect = document.getElementById('actHead');
    function refreshTypes() {
      const head = headSelect.value;
      let items;
      // When climate head is selected, filter by chosen subhead as well
      if (head === 'Climate') {
        const subSel = document.getElementById('actSubhead');
        const selectedSub = subSel ? subSel.value : '';
        items = data.catalog.filter(c => c.head === head && c.subhead === selectedSub);
      } else {
        items = data.catalog.filter(c => c.head === head);
      }
      typeSelect.innerHTML = '';
      items.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.id;
        opt.textContent = item.type;
        typeSelect.appendChild(opt);
      });
      if (items.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'No types defined';
        typeSelect.appendChild(opt);
      }
      // Trigger update of unit on type change
      updateUnitFields();
    }

    // Populate or hide the subhead dropdown based on selected head
    function refreshSubheads() {
      const subContainer = document.getElementById('subheadContainer');
      const subSelect = document.getElementById('actSubhead');
      if (!subContainer || !subSelect) return;
      const head = headSelect.value;
      if (head === 'Climate') {
        subContainer.style.display = 'block';
        subSelect.innerHTML = '';
        CLIMATE_SUBHEADS.forEach(sub => {
          const opt = document.createElement('option');
          opt.value = sub;
          opt.textContent = sub;
          subSelect.appendChild(opt);
        });
      } else {
        subContainer.style.display = 'none';
        subSelect.innerHTML = '';
      }
    }
    headSelect.addEventListener('change', function () {
      // When head changes, update subhead dropdown, types and beneficiary requirements
      refreshSubheads();
      refreshTypes();
      updateBeneficiaryRequirements();
      computeCosts(); // Add this to recalculate costs when head changes
    });
    typeSelect.addEventListener('change', updateUnitFields);
    // Adjust beneficiary and location field requirements based on selected head
    function updateBeneficiaryRequirements() {
      const head = headSelect.value;
      const requireFields = (head === 'NRM');
      const beneNameInput = document.getElementById('actBeneName');
      const benePhoneInput = document.getElementById('actBenePhone');
      const villageSelect = document.getElementById('actVillage');
      const latInput = document.getElementById('actLat');
      const lonInput = document.getElementById('actLon');
      if (beneNameInput) beneNameInput.required = requireFields;
      if (benePhoneInput) benePhoneInput.required = requireFields;
      if (villageSelect) villageSelect.required = requireFields;
      if (latInput) latInput.required = requireFields;
      if (lonInput) lonInput.required = requireFields;
      // For non-NRM heads, clear village selection so the default 'Select Village' is active
      if (!requireFields && villageSelect) {
        villageSelect.value = '';
      }
      // Show or hide the village container depending on whether the head requires it
      if (villageSelect) {
        const vDiv = villageSelect.parentElement;
        if (vDiv) {
          vDiv.style.display = requireFields ? '' : 'none';
        }
      }
    }
    // Trigger beneficiary requirement update when head changes
    // updateBeneficiaryRequirements is now called from head change handler above
    function updateUnitFields() {
      const catItem = data.catalog.find(c => c.id === typeSelect.value);
      const unitInput = document.getElementById('actUnit');
      unitInput.value = catItem ? catItem.unitName : '';
      // Also compute cost preview if quantity already entered
      computeCosts();
    }
    // Compute cost preview when quantity, beneficiary type or type changes
    document.getElementById('actQuantity').addEventListener('input', computeCosts);
    document.getElementById('actBeneType').addEventListener('change', computeCosts);
    document.getElementById('actConvergence').addEventListener('input', computeCosts);
    // Make sure computeCosts is called when type changes
    typeSelect.addEventListener('change', function() {
      updateUnitFields();
      computeCosts();
    });
    // Initialize subheads, types and beneficiary requirements for default head
    refreshSubheads();
    refreshTypes();
    updateBeneficiaryRequirements();
    // Refresh villages when head changes may not be necessary but ensures select stays consistent on first load
    // Prepare an array to hold selected photos for the activity.  When the
    // surveyor chooses files, they are read immediately and stored as
    // data URIs on this array.  The array is cleared each time a new
    // selection is made.
    const selectedPhotos = [];
    const photoInput = document.getElementById('actPhotos');
    if (photoInput) {
      photoInput.addEventListener('change', function () {
        selectedPhotos.length = 0;
        const files = Array.from(this.files || []);
        files.forEach(file => {
          const reader = new FileReader();
          reader.onload = function (ev) {
            selectedPhotos.push({ id: generateId(), data: ev.target.result, name: file.name, timestamp: Date.now() });
          };
          reader.readAsDataURL(file);
        });
      });
    }

    // Handle activity submission
    const actForm = document.getElementById('activityForm');
    actForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (assignments.length === 0) {
        alert('No project assigned.');
        return;
      }
      const projectId = document.getElementById('actProject').value;
      const head = document.getElementById('actHead').value;
      const catItem = data.catalog.find(c => c.id === document.getElementById('actType').value);
      if (!catItem) {
        alert('Select a valid activity type.');
        return;
      }
      const quantity = parseFloat(document.getElementById('actQuantity').value);
      if (isNaN(quantity) || quantity <= 0) {
        alert('Quantity must be greater than zero.');
        return;
      }
      const beneName = document.getElementById('actBeneName').value.trim();
      const benePhone = document.getElementById('actBenePhone').value.trim();
      const village = document.getElementById('actVillage').value;
      const beneType = document.getElementById('actBeneType').value;
      const latVal = document.getElementById('actLat').value.trim();
      const lonVal = document.getElementById('actLon').value.trim();
      // For NRM head, beneficiary details and coordinates are mandatory
      if (head === 'NRM') {
        if (!beneName || !benePhone || !village || !latVal || !lonVal) {
          alert('Beneficiary name, phone, village and location (latitude & longitude) are required for NRM activities.');
          return;
        }
      }
      // Create or reuse beneficiary
      let bene = data.beneficiaries.find(b => b.name === beneName && b.phone === benePhone && b.village === village);
      if (!bene) {
        bene = { id: generateId(), name: beneName, phone: benePhone, village, type: beneType };
        data.beneficiaries.push(bene);
      }
      // Compute costs
      const unskilledTotal = quantity * (catItem.unitUnskilled || 0);
      const skilledTotal = quantity * (catItem.unitSkilled || 0);
      const materialTotal = quantity * (catItem.unitMaterial || 0);
      const total = unskilledTotal + skilledTotal + materialTotal;
      // Calculate community contribution based on head and activity type rules
      let contribution = 0;
      if (head === 'NRM') {
        contribution = 0.16 * unskilledTotal;
      } else if (head === 'Climate') {
        // Soil Testing exception: no community contribution
        if (catItem.type === 'Soil Testing') {
          contribution = 0;
        } else {
          contribution = (beneType === 'Individual') ? 0.25 * materialTotal : 0;
        }
      } else if (head === 'Livelihood') {
        contribution = 0.25 * materialTotal;
      }
      // Read convergence value (optional)
      let convergence = 0;
      const convInput = document.getElementById('actConvergence');
      if (convInput && convInput.value !== '') {
        const cVal = parseFloat(convInput.value);
        convergence = (!isNaN(cVal) && cVal > 0) ? cVal : 0;
      }
      const net = total - contribution - convergence;
      // Save activity
      const newActivity = {
        id: generateId(),
        projectId,
        head,
        // For climate head, capture subhead from catalog item
        subhead: catItem.subhead || null,
        type: catItem.type,
        unitName: catItem.unitName,
        quantity,
        unskilledRate: catItem.unitUnskilled,
        skilledRate: catItem.unitSkilled,
        materialRate: catItem.unitMaterial,
        // Store detailed cost breakdown for later analysis
        unskilledTotal,
        skilledTotal,
        materialTotal,
        total,
        contribution,
        convergence,
        netGrant: net,
        beneficiaryId: bene.id,
        plotNumber: document.getElementById('actPlot').value.trim(),
        lat: document.getElementById('actLat').value || null,
        lon: document.getElementById('actLon').value || null,
        createdBy: session.id,
        timestamp: Date.now()
      };
      // Attach any selected photo evidence.  Cloning the array ensures
      // subsequent selections do not mutate previously saved activities.
      if (selectedPhotos && selectedPhotos.length > 0) {
        newActivity.photos = selectedPhotos.slice();
      }
      data.activities.push(newActivity);
      saveData(data);
      alert('Activity saved successfully.');
      actForm.reset();
      document.getElementById('computedCosts').style.display = 'none';
      refreshTypes();
      renderMyActivities(session);
    });

    // Attach geolocation handler for location button
    const locBtn = document.getElementById('locBtn');
    if (locBtn) {
      locBtn.addEventListener('click', function () {
        if (!navigator.geolocation) {
          alert('Geolocation is not supported by your browser');
          return;
        }
        const latInput = document.getElementById('actLat');
        const lonInput = document.getElementById('actLon');
        locBtn.disabled = true;
        const originalText = locBtn.textContent;
        locBtn.textContent = 'Locating...';
        navigator.geolocation.getCurrentPosition(function (position) {
          latInput.value = position.coords.latitude.toFixed(6);
          lonInput.value = position.coords.longitude.toFixed(6);
          locBtn.disabled = false;
          locBtn.textContent = originalText;
        }, function (err) {
          alert('Unable to retrieve location: ' + err.message);
          locBtn.disabled = false;
          locBtn.textContent = originalText;
        });
      });
    }
    // Render current activities for this surveyor
    renderMyActivities(session);

    // Populate surveyor project summary dropdown and attach handler
    const survProjSelect = document.getElementById('survProjSelect');
    if (survProjSelect) {
      survProjSelect.innerHTML = '';
      assignments.forEach(a => {
        const proj = data.projects.find(p => p.id === a.projectId);
        if (proj) {
          const opt = document.createElement('option');
          opt.value = proj.id;
          opt.textContent = proj.title;
          survProjSelect.appendChild(opt);
        }
      });
      if (assignments.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'No projects assigned';
        survProjSelect.appendChild(opt);
      }
      // When project selection changes, re-render summary
      survProjSelect.addEventListener('change', function () {
        renderSurveyorProjectSummary(this.value);
      });
      // Render summary for first project (if any)
      if (assignments.length > 0) {
        renderSurveyorProjectSummary(survProjSelect.value);
      } else {
        // Clear summary
        const sumDiv = document.getElementById('survProjSummary');
        if (sumDiv) sumDiv.innerHTML = '<p>No assigned projects to summarize.</p>';
      }
    }
  }

  /**
   * Render the list of activities created by the current surveyor.
   * @param {Object} session
   */
  function renderMyActivities(session) {
    const data = loadData();
    const myListDiv = document.getElementById('myActivityList');
    if (!myListDiv) return;
    // Filter activities created by the current surveyor
    const myActivities = data.activities.filter(a => a.createdBy === session.id);
    if (myActivities.length === 0) {
      myListDiv.innerHTML = '<p>No activities recorded yet.</p>';
      return;
    }
    // Group activities by project
    const byProject = {};
    myActivities.forEach(act => {
      byProject[act.projectId] = byProject[act.projectId] || [];
      byProject[act.projectId].push(act);
    });
    let html = '';
    Object.keys(byProject).forEach(pid => {
      const proj = data.projects.find(p => p.id === pid);
      const title = proj ? proj.title : pid;
      html += `<h4>${title}</h4>`;
      html += '<table><thead><tr><th>Date</th><th>Head</th><th>Type</th><th>Qty</th><th>Unit</th><th>Total</th><th>Net Grant</th></tr></thead><tbody>';
      byProject[pid].forEach(act => {
        html += `<tr>
          <td>${new Date(act.timestamp).toLocaleDateString()}</td>
          <td>${act.head}</td>
          <td>${act.type}</td>
          <td>${act.quantity}</td>
          <td>${act.unitName || ''}</td>
          <td>${act.total.toFixed(2)}</td>
          <td>${act.netGrant.toFixed(2)}</td>
        </tr>`;
      });
      html += '</tbody></table>';
    });
    myListDiv.innerHTML = html;
  }

  /**
   * Render a project-level cost summary for the surveyor view. This allows
   * surveyors to inspect aggregate costs and drill down into activities for
   * projects they are assigned to. Similar to the admin project summary but
   * scoped to a single project at a time.
   * @param {string} projectId
   */
  function renderSurveyorProjectSummary(projectId) {
    const container = document.getElementById('survProjSummary');
    if (!container) return;
    const data = loadData();
    const project = data.projects.find(p => p.id === projectId);
    if (!project) {
      container.innerHTML = '<p>Select a valid project to see summary.</p>';
      return;
    }
    // Compute per-head totals for this project
    const totals = {};
    HEADS.forEach(h => {
      totals[h] = { material: 0, unskilled: 0, skilled: 0, total: 0, contribution: 0, net: 0 };
    });
    data.activities.forEach(act => {
      if (act.projectId !== projectId) return;
      const t = totals[act.head];
      if (!t) return;
      // compute fallback breakdown for missing fields
      const matT = (act.materialTotal != null)
        ? act.materialTotal
        : (act.quantity * ((act.materialRate != null) ? act.materialRate : 0));
      const unskillT = (act.unskilledTotal != null)
        ? act.unskilledTotal
        : (act.quantity * ((act.unskilledRate != null) ? act.unskilledRate : 0));
      const skillT = (act.skilledTotal != null)
        ? act.skilledTotal
        : (act.quantity * ((act.skilledRate != null) ? act.skilledRate : 0));
      const totT = (act.total != null && !isNaN(act.total)) ? act.total : (matT + unskillT + skillT);
      const contr = (act.contribution != null) ? act.contribution : 0;
      const conv = (act.convergence != null) ? act.convergence : 0;
      const net = (act.netGrant != null) ? act.netGrant : (totT - contr - conv);
      t.material += matT;
      t.unskilled += unskillT;
      t.skilled += skillT;
      t.total += totT;
      t.contribution += contr;
      t.net += net;
    });
    let grandTotal = 0;
    HEADS.forEach(h => { grandTotal += totals[h].total; });
    // Build summary table
    let html = `<h4>${project.title} (${project.code || ''})</h4>`;
    html += '<table><thead><tr><th>Head</th><th>Material</th><th>Unskilled</th><th>Skilled</th><th>Total</th><th>Contribution</th><th>Net</th><th>Cap (%)</th><th>Utilization (%)</th></tr></thead><tbody>';
    const caps = { NRM: 42.5, Climate: 27.5, Livelihood: 7.5, Training: 5, Management: 17.5 };
    // Aggregate sums for total row
    let aggM = 0;
    let aggU = 0;
    let aggSkl = 0;
    let aggTot = 0;
    let aggContrib = 0;
    let aggNet = 0;
    HEADS.forEach(h => {
      const util = grandTotal > 0 ? (totals[h].total / grandTotal * 100) : 0;
      aggM += totals[h].material;
      aggU += totals[h].unskilled;
      aggSkl += totals[h].skilled;
      aggTot += totals[h].total;
      aggContrib += totals[h].contribution;
      aggNet += totals[h].net;
      html += `<tr data-head="${h}" style="cursor:pointer;">
        <td>${h}</td>
        <td>${totals[h].material.toFixed(2)}</td>
        <td>${totals[h].unskilled.toFixed(2)}</td>
        <td>${totals[h].skilled.toFixed(2)}</td>
        <td>${totals[h].total.toFixed(2)}</td>
        <td>${totals[h].contribution.toFixed(2)}</td>
        <td>${totals[h].net.toFixed(2)}</td>
        <td>${caps[h]}%</td>
        <td>${util.toFixed(1)}%</td>
      </tr>`;
    });
    // Append total row across heads
    html += `<tr class="total-row" style="font-weight:bold; background:#f8f8f8;">
      <td>Total</td>
      <td>${aggM.toFixed(2)}</td>
      <td>${aggU.toFixed(2)}</td>
      <td>${aggSkl.toFixed(2)}</td>
      <td>${aggTot.toFixed(2)}</td>
      <td>${aggContrib.toFixed(2)}</td>
      <td>${aggNet.toFixed(2)}</td>
      <td></td>
      <td></td>
    </tr>`;
    html += '</tbody></table>';
    html += '<div id="survProjDetails" style="margin-top:15px;"></div>';
    container.innerHTML = html;
    // Attach click handler to each row
    container.querySelectorAll('table tbody tr').forEach(row => {
      row.addEventListener('click', function () {
        const head = this.getAttribute('data-head');
        renderProjectSummaryDetails(projectId, head, 'survProjDetails');
      });
    });
  }

  // Kick off the app on load
  document.addEventListener('DOMContentLoaded', render);
})();