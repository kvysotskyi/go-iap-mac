// IAP Tunnel Manager - Frontend JavaScript

// State
const state = {
    connections: [],        // Saved connections (formerly favorites)
    selectedConnection: null,
    tunnels: [],           // All tunnels
    selectedTunnel: null,  // Currently selected tunnel for the connection
    projects: [],
    vms: [],
    windowsAppInstalled: false,
    // New connection form state
    newConnection: {
        name: '',
        project: null,
        vm: null
    },
    isStartingTunnel: false,
    currentView: 'new' // 'new', 'details', 'empty'
};

// DOM Elements
const elements = {
    // Auth
    authBanner: document.getElementById('auth-status'),
    authMessage: document.querySelector('.auth-message'),
    authBtn: document.getElementById('auth-btn'),
    authBtnText: document.querySelector('.auth-btn-text'),
    authBtnSpinner: document.querySelector('.auth-btn-spinner'),
    installGcloudBtn: document.getElementById('install-gcloud-btn'),
    checkGcloudBtn: document.getElementById('check-gcloud-btn'),
    // Windows App
    windowsAppBanner: document.getElementById('windows-app-status'),
    windowsAppMessage: document.querySelector('.warning-message'),
    // Top bar
    connectionStatus: document.getElementById('connection-status'),
    openWindowsAppBtn: document.getElementById('open-windows-app-btn'),
    // Connections panel
    connectionsList: document.getElementById('connections-list'),
    newConnectionBtn: document.getElementById('new-connection-btn'),
    // Views
    connectionDetailsView: document.getElementById('connection-details-view'),
    newConnectionView: document.getElementById('new-connection-view'),
    emptyStateView: document.getElementById('empty-state-view'),
    // Details view
    connectionName: document.getElementById('connection-name'),
    connectionStatusBadge: document.getElementById('connection-status-badge'),
    menuBtn: document.getElementById('menu-btn'),
    overflowMenu: document.getElementById('overflow-menu'),
    menuCreateBookmark: document.getElementById('menu-create-bookmark'),
    menuGeneratePassword: document.getElementById('menu-generate-password'),
    menuDeleteConnection: document.getElementById('menu-delete-connection'),
    detailProject: document.getElementById('detail-project'),
    detailVm: document.getElementById('detail-vm'),
    detailZone: document.getElementById('detail-zone'),
    detailAddress: document.getElementById('detail-address'),
    startTunnelBtn: document.getElementById('start-tunnel-btn'),
    stopTunnelBtn: document.getElementById('stop-tunnel-btn'),
    copyAddressBtn: document.getElementById('copy-address-btn'),
    clearLogsBtn: document.getElementById('clear-logs-btn'),
    // Panel footer buttons
    stopAllBtn: document.getElementById('stop-all-btn'),
    logsContainer: document.getElementById('logs-container'),
    // New connection view
    newConnectionTitle: document.getElementById('new-connection-title'),
    projectSearch: document.getElementById('project-search'),
    projectsList: document.getElementById('projects-list'),
    vmSearch: document.getElementById('vm-search'),
    vmsList: document.getElementById('vms-list'),
    summaryProject: document.getElementById('summary-project'),
    summaryVm: document.getElementById('summary-vm'),
    summaryZone: document.getElementById('summary-zone'),
    cancelConnectionBtn: document.getElementById('cancel-connection-btn'),
    saveConnectionBtn: document.getElementById('save-connection-btn'),
    // Password modals
    passwordModal: document.getElementById('password-modal'),
    passwordModalClose: document.getElementById('password-modal-close'),
    passwordUsername: document.getElementById('password-username'),
    passwordSaveKeychain: document.getElementById('password-save-keychain'),
    passwordUpdateBookmark: document.getElementById('password-update-bookmark'),
    bookmarkWarning: document.getElementById('bookmark-warning'),
    passwordCancelBtn: document.getElementById('password-cancel-btn'),
    passwordGenerateBtn: document.getElementById('password-generate-btn'),
    passwordResultModal: document.getElementById('password-result-modal'),
    resultUsername: document.getElementById('result-username'),
    resultPassword: document.getElementById('result-password'),
    resultKeychain: document.getElementById('result-keychain'),
    resultBookmark: document.getElementById('result-bookmark'),
    togglePasswordBtn: document.getElementById('toggle-password-btn'),
    passwordDoneBtn: document.getElementById('password-done-btn'),
    loadingModal: document.getElementById('loading-modal'),
    loadingMessage: document.getElementById('loading-message'),
    // Confirm modal
    confirmModal: document.getElementById('confirm-modal'),
    confirmTitle: document.getElementById('confirm-title'),
    confirmMessage: document.getElementById('confirm-message'),
    confirmCancelBtn: document.getElementById('confirm-cancel-btn'),
    confirmOkBtn: document.getElementById('confirm-ok-btn'),
    // Bookmark modal
    bookmarkModal: document.getElementById('bookmark-modal'),
    bookmarkModalClose: document.getElementById('bookmark-modal-close'),
    bookmarkAddress: document.getElementById('bookmark-address'),
    bookmarkWithPassword: document.getElementById('bookmark-with-password'),
    bookmarkPasswordOptions: document.getElementById('bookmark-password-options'),
    bookmarkUsername: document.getElementById('bookmark-username'),
    bookmarkSaveKeychain: document.getElementById('bookmark-save-keychain'),
    bookmarkCancelBtn: document.getElementById('bookmark-cancel-btn'),
    bookmarkCreateBtn: document.getElementById('bookmark-create-btn')
};

// Confirm modal state
let confirmResolve = null;

// Initialize
async function init() {
    await checkAuth();
    await checkWindowsApp();
    await loadConnections();
    await loadProjects();
    await loadTunnels();
    setupEventListeners();
    startStatusPolling();
    
    // Show appropriate view
    if (state.connections.length === 0) {
        showView('new');
    } else {
        showView('empty');
    }
}

// ==================== Authentication ====================

async function checkAuth() {
    try {
        // First check if gcloud is installed
        const gcloudInfo = await window.go.main.App.FindGcloud();
        if (!gcloudInfo.found) {
            showGcloudMissing();
            elements.connectionStatus.classList.add('disconnected');
            return false;
        }
        
        // Then check authentication
        const result = await window.go.main.App.CheckAuth();
        if (!result.authenticated) {
            showAuthError(result.error);
            elements.connectionStatus.classList.add('disconnected');
            return false;
        } else {
            hideAuthError();
            elements.connectionStatus.classList.remove('disconnected');
            return true;
        }
    } catch (error) {
        showAuthError('Failed to check authentication: ' + error.message);
        elements.connectionStatus.classList.add('disconnected');
        return false;
    }
}

function showGcloudMissing() {
    elements.authBanner.classList.remove('hidden');
    elements.authBanner.classList.remove('authenticating');
    elements.authMessage.textContent = 'Google Cloud CLI (gcloud) not found. Please install it to continue.';
    
    // Show install and check buttons, hide auth button
    elements.installGcloudBtn.classList.remove('hidden');
    elements.checkGcloudBtn.classList.remove('hidden');
    elements.authBtn.classList.add('hidden');
}

function showAuthError(message) {
    elements.authBanner.classList.remove('hidden');
    elements.authBanner.classList.remove('authenticating');
    elements.authMessage.textContent = message;
    
    // Show auth button, hide install buttons
    elements.installGcloudBtn.classList.add('hidden');
    elements.checkGcloudBtn.classList.add('hidden');
    elements.authBtn.classList.remove('hidden');
    resetAuthButton();
}

function hideAuthError() {
    elements.authBanner.classList.add('hidden');
    elements.authBanner.classList.remove('authenticating');
    
    // Hide all buttons
    elements.installGcloudBtn.classList.add('hidden');
    elements.checkGcloudBtn.classList.add('hidden');
    elements.authBtn.classList.add('hidden');
    resetAuthButton();
}

function resetAuthButton() {
    elements.authBtn.disabled = false;
    elements.authBtnText.textContent = 'Authenticate';
    elements.authBtnSpinner.classList.add('hidden');
}

async function runAuthentication() {
    elements.authBtn.disabled = true;
    elements.authBtnText.textContent = 'Authenticating...';
    elements.authBtnSpinner.classList.remove('hidden');
    elements.authBanner.classList.add('authenticating');
    elements.authMessage.textContent = 'Opening browser for Google authentication...';
    
    try {
        const result = await window.go.main.App.RunADCLogin();
        if (result.status === 'success') {
            hideAuthError();
            showToast('Successfully authenticated', 'success');
            await loadProjects();
        } else {
            showAuthError(result.message);
        }
    } catch (error) {
        showAuthError('Authentication error: ' + error.message);
    }
}

async function openGcloudInstallPage() {
    try {
        await window.go.main.App.OpenGcloudInstallPage();
        showToast('Opening Google Cloud SDK installation page...', 'info');
    } catch (error) {
        showToast('Failed to open browser: ' + error.message, 'error');
    }
}

async function recheckGcloud() {
    elements.checkGcloudBtn.disabled = true;
    elements.checkGcloudBtn.textContent = 'Checking...';
    
    try {
        const gcloudInfo = await window.go.main.App.FindGcloud();
        if (gcloudInfo.found) {
            showToast('Google Cloud CLI found!', 'success');
            // Now check auth status
            await checkAuth();
        } else {
            showToast('Google Cloud CLI still not found', 'error');
        }
    } catch (error) {
        showToast('Failed to check: ' + error.message, 'error');
    } finally {
        elements.checkGcloudBtn.disabled = false;
        elements.checkGcloudBtn.textContent = 'Check Again';
    }
}

// ==================== Windows App ====================

async function checkWindowsApp() {
    try {
        const result = await window.go.main.App.CheckWindowsApp();
        state.windowsAppInstalled = result.installed;
        
        if (!result.installed) {
            elements.windowsAppBanner.classList.remove('hidden');
        } else {
            elements.windowsAppBanner.classList.add('hidden');
        }
    } catch (error) {
        state.windowsAppInstalled = false;
    }
    updateButtons();
}

async function openWindowsApp() {
    if (!state.windowsAppInstalled) {
        showToast('Windows App is not installed', 'error');
        return;
    }
    try {
        await window.go.main.App.OpenWindowsApp();
        showToast('Opening Windows App...', 'success');
    } catch (error) {
        showToast('Failed to open Windows App: ' + error.message, 'error');
    }
}

// ==================== Connections (Saved) ====================

async function loadConnections() {
    try {
        const favorites = await window.go.main.App.GetFavorites();
        state.connections = (favorites || []).map(f => ({
            id: f.id,
            name: f.displayName,
            projectId: f.projectId,
            projectName: f.projectName,
            vmName: f.instanceName,
            zone: f.zone,
            remotePort: f.remotePort || 3389,
            localPort: f.localPort || 0,
            username: f.username || '',
            hasBookmark: f.hasBookmark || false,
            bookmarkHasCreds: f.bookmarkHasCreds || false
        }));
        renderConnectionsList();
    } catch (error) {
        console.error('Failed to load connections:', error);
        state.connections = [];
    }
}

function renderConnectionsList() {
    if (state.connections.length === 0) {
        elements.connectionsList.innerHTML = '<div class="connections-empty">No saved connections yet</div>';
        return;
    }
    
    elements.connectionsList.innerHTML = state.connections.map(conn => {
        const isSelected = state.selectedConnection?.id === conn.id;
        const tunnelsForConn = getConnectionTunnels(conn);
        const hasRunning = tunnelsForConn.some(t => t.status === 'running' || t.status === 'starting');
        const statusClass = hasRunning ? (tunnelsForConn.some(t => t.status === 'running') ? 'running' : 'starting') : '';
        
        return `
            <div class="connection-item ${isSelected ? 'selected' : ''}" data-connection-id="${conn.id}">
                <div class="connection-item-name">
                    <span class="connection-item-status ${statusClass}"></span>
                    ${escapeHtml(conn.name)}
                </div>
                <div class="connection-item-details">${escapeHtml(conn.vmName)} • ${escapeHtml(conn.zone)}</div>
            </div>
        `;
    }).join('');
    
    // Add click handlers
    elements.connectionsList.querySelectorAll('.connection-item').forEach(item => {
        item.addEventListener('click', () => selectConnection(item.dataset.connectionId));
    });
}

function selectConnection(connectionId) {
    const conn = state.connections.find(c => c.id === connectionId);
    if (!conn) return;
    
    state.selectedConnection = conn;
    state.selectedTunnel = null;
    
    // Update details view
    elements.connectionName.textContent = conn.name;
    elements.detailProject.textContent = conn.projectId;
    elements.detailVm.textContent = conn.vmName;
    elements.detailZone.textContent = conn.zone;
    
    // Update fixed address (always show the connection's port)
    elements.detailAddress.textContent = `localhost:${conn.localPort}`;
    
    // Update username
    const detailUsername = document.getElementById('detail-username');
    if (detailUsername) {
        detailUsername.textContent = conn.username || '-';
    }
    
    // Update bookmark status
    updateBookmarkStatusDisplay(conn);
    
    // Update tunnel status (running/stopped)
    updateConnectionStatus();
    
    // Show details view
    showView('details');
    renderConnectionsList();
    updateButtons();
}

function updateBookmarkStatusDisplay(conn) {
    const detailBookmark = document.getElementById('detail-bookmark');
    if (!detailBookmark) return;
    
    if (!conn.hasBookmark) {
        detailBookmark.innerHTML = '<span class="status-icon">-</span> No bookmark';
        detailBookmark.className = 'info-value bookmark-status no-bookmark';
    } else if (conn.bookmarkHasCreds) {
        detailBookmark.innerHTML = '<span class="status-icon">🔖</span> With credentials';
        detailBookmark.className = 'info-value bookmark-status has-creds';
    } else {
        detailBookmark.innerHTML = '<span class="status-icon">🔖</span> Without credentials';
        detailBookmark.className = 'info-value bookmark-status has-bookmark';
    }
}

function getConnectionTunnels(conn) {
    if (!conn) return [];
    return state.tunnels.filter(t => 
        t.projectId === conn.projectId && 
        t.vmName === conn.vmName && 
        t.zone === conn.zone
    );
}

function getActiveConnectionTunnel(conn) {
    const tunnels = getConnectionTunnels(conn);
    // Return the most recently started running tunnel
    const running = tunnels.filter(t => t.status === 'running');
    if (running.length > 0) {
        return running.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))[0];
    }
    const starting = tunnels.filter(t => t.status === 'starting');
    if (starting.length > 0) {
        return starting[0];
    }
    return null;
}

function updateConnectionStatus() {
    if (!state.selectedConnection) return;
    
    const tunnels = getConnectionTunnels(state.selectedConnection);
    const activeTunnel = getActiveConnectionTunnel(state.selectedConnection);
    
    // Update status badge only (address is fixed per connection)
    if (activeTunnel) {
        if (activeTunnel.status === 'running') {
            elements.connectionStatusBadge.textContent = 'Running';
            elements.connectionStatusBadge.className = 'connection-status-badge running';
        } else {
            elements.connectionStatusBadge.textContent = 'Starting';
            elements.connectionStatusBadge.className = 'connection-status-badge starting';
        }
    } else {
        elements.connectionStatusBadge.textContent = 'Stopped';
        elements.connectionStatusBadge.className = 'connection-status-badge';
    }
    
    // Update logs for active tunnel
    if (activeTunnel) {
        state.selectedTunnel = activeTunnel;
        updateLogsUI(activeTunnel);
    } else if (state.selectedTunnel) {
        const updated = tunnels.find(t => t.id === state.selectedTunnel.id);
        if (updated) {
            updateLogsUI(updated);
        }
    }
}

// ==================== New Connection ====================

function showNewConnectionForm() {
    state.newConnection = { project: null, vm: null };
    elements.projectSearch.value = '';
    elements.summaryProject.textContent = '-';
    elements.summaryVm.textContent = '-';
    elements.summaryZone.textContent = '-';
    elements.vmSearch.disabled = true;
    elements.vmSearch.value = '';
    elements.vmsList.innerHTML = '<div class="placeholder">Select a project first</div>';
    elements.newConnectionTitle.textContent = 'New Connection';
    
    // Re-render projects to clear selection
    renderProjects(state.projects);
    
    showView('new');
    updateButtons();
}

function cancelNewConnection() {
    if (state.connections.length > 0) {
        if (state.selectedConnection) {
            showView('details');
        } else {
            showView('empty');
        }
    } else {
        showView('empty');
    }
}

async function saveConnection() {
    if (!state.newConnection.project || !state.newConnection.vm) {
        showToast('Please select a project and VM', 'error');
        return;
    }
    
    // Check if VM is Windows (should have "windows" in the OS or machine type description)
    const vm = state.newConnection.vm;
    if (!vm.isWindows) {
        showToast('Only Windows VMs can be saved. This VM does not appear to be running Windows.', 'error');
        return;
    }
    
    // Check if connection already exists
    const existingConn = state.connections.find(c => 
        c.projectId === state.newConnection.project.id &&
        c.vmName === state.newConnection.vm.name &&
        c.zone === state.newConnection.vm.zone
    );
    if (existingConn) {
        showToast('This connection already exists', 'error');
        return;
    }
    
    // Generate name: VM name (like before with favorites)
    const name = state.newConnection.vm.name;
    
    try {
        await window.go.main.App.AddFavorite(
            name,
            state.newConnection.project.id,
            state.newConnection.project.name,
            state.newConnection.vm.name,
            state.newConnection.vm.zone,
            3389,
            0
        );
        
        await loadConnections();
        
        // Select the new connection
        const newConn = state.connections.find(c => 
            c.projectId === state.newConnection.project.id &&
            c.vmName === state.newConnection.vm.name &&
            c.zone === state.newConnection.vm.zone
        );
        if (newConn) {
            selectConnection(newConn.id);
        }
        
        showToast('Connection saved', 'success');
    } catch (error) {
        const errorMsg = error?.message || String(error) || 'Unknown error';
        showToast('Failed to save connection: ' + errorMsg, 'error');
    }
}

async function deleteConnection() {
    hideOverflowMenu();
    
    if (!state.selectedConnection) {
        showToast('No connection selected', 'error');
        return;
    }
    
    const hasBookmark = state.selectedConnection.hasBookmark;
    const confirmMessage = hasBookmark 
        ? `Are you sure you want to delete "${state.selectedConnection.name}"? This will also delete the Windows App bookmark. This cannot be undone.`
        : `Are you sure you want to delete "${state.selectedConnection.name}"? This cannot be undone.`;
    
    const confirmed = await showConfirm('Delete Connection', confirmMessage);
    
    if (!confirmed) return;
    
    try {
        // Delete Windows App bookmark first if it exists
        if (hasBookmark && state.windowsAppInstalled) {
            try {
                await window.go.main.App.DeleteWindowsAppBookmark(state.selectedConnection.id);
            } catch (e) {
                console.error('Failed to delete bookmark:', e);
                // Continue with connection deletion even if bookmark deletion fails
            }
        }
        
        // Delete the connection
        await window.go.main.App.RemoveFavorite(state.selectedConnection.id);
        await loadConnections();
        state.selectedConnection = null;
        
        if (state.connections.length > 0) {
            showView('empty');
        } else {
            showView('new');
        }
        
        showToast('Connection deleted', 'success');
    } catch (error) {
        const errorMsg = error?.message || String(error) || 'Unknown error';
        showToast('Failed to delete connection: ' + errorMsg, 'error');
    }
}

// Custom confirm dialog (replaces native confirm which doesn't work in Wails)
function showConfirm(title, message) {
    return new Promise((resolve) => {
        confirmResolve = resolve;
        elements.confirmTitle.textContent = title;
        elements.confirmMessage.textContent = message;
        elements.confirmModal.classList.remove('hidden');
    });
}

function hideConfirm(result) {
    elements.confirmModal.classList.add('hidden');
    if (confirmResolve) {
        confirmResolve(result);
        confirmResolve = null;
    }
}

// ==================== Projects & VMs ====================

async function loadProjects(filter = '') {
    elements.projectsList.innerHTML = '<div class="loading">Loading projects...</div>';
    
    try {
        const projects = await window.go.main.App.ListProjects(filter);
        state.projects = projects || [];
        renderProjects(state.projects);
    } catch (error) {
        elements.projectsList.innerHTML = `<div class="error-message">Failed to load: ${error.message}</div>`;
    }
}

function renderProjects(projects) {
    if (!projects || projects.length === 0) {
        elements.projectsList.innerHTML = '<div class="placeholder">No projects found</div>';
        return;
    }
    
    elements.projectsList.innerHTML = projects.map(p => `
        <div class="list-item ${state.newConnection.project?.id === p.id ? 'selected' : ''}" 
             data-project-id="${p.id}" data-project-name="${escapeHtml(p.name)}">
            <div class="list-item-title">${escapeHtml(p.name)}</div>
            <div class="list-item-subtitle">${escapeHtml(p.id)}</div>
        </div>
    `).join('');
    
    elements.projectsList.querySelectorAll('.list-item').forEach(item => {
        item.addEventListener('click', () => selectProject(item.dataset.projectId, item.dataset.projectName));
    });
}

async function selectProject(projectId, projectName) {
    state.newConnection.project = { id: projectId, name: projectName };
    state.newConnection.vm = null;
    
    elements.summaryProject.textContent = projectId;
    elements.summaryVm.textContent = '-';
    elements.summaryZone.textContent = '-';
    elements.vmSearch.disabled = false;
    elements.vmSearch.value = '';
    
    renderProjects(state.projects);
    await loadVMs(projectId);
    updateButtons();
}

async function loadVMs(projectId, filter = '') {
    elements.vmsList.innerHTML = '<div class="loading">Loading VMs...</div>';
    
    try {
        const vms = await window.go.main.App.ListVMs(projectId, filter);
        state.vms = vms || [];
        renderVMs(state.vms);
    } catch (error) {
        elements.vmsList.innerHTML = `<div class="error-message">Failed to load: ${error.message}</div>`;
    }
}

function renderVMs(vms) {
    if (!vms || vms.length === 0) {
        elements.vmsList.innerHTML = '<div class="placeholder">No VMs found</div>';
        return;
    }
    
    elements.vmsList.innerHTML = vms.map(vm => {
        const isSelected = state.newConnection.vm?.name === vm.name && state.newConnection.vm?.zone === vm.zone;
        const statusClass = (vm.status || 'unknown').toLowerCase();
        const osIcon = vm.isWindows ? '🪟' : '🐧';
        const osClass = vm.isWindows ? 'os-windows' : 'os-linux';
        return `
            <div class="list-item ${isSelected ? 'selected' : ''} ${osClass}" 
                 data-vm-name="${vm.name}" 
                 data-vm-zone="${vm.zone}" 
                 data-vm-status="${vm.status}"
                 data-vm-machine-type="${vm.machineType || ''}"
                 data-vm-is-windows="${vm.isWindows}">
                <div class="list-item-title">
                    <span class="os-icon">${osIcon}</span>
                    ${escapeHtml(vm.name)}
                    <span class="vm-status ${statusClass}">${vm.status || 'UNKNOWN'}</span>
                </div>
                <div class="list-item-subtitle">
                    ${escapeHtml(vm.zone)} • ${escapeHtml(vm.machineType || 'unknown')}
                </div>
            </div>
        `;
    }).join('');
    
    elements.vmsList.querySelectorAll('.list-item').forEach(item => {
        item.addEventListener('click', () => selectVM(
            item.dataset.vmName, 
            item.dataset.vmZone, 
            item.dataset.vmStatus,
            item.dataset.vmMachineType,
            item.dataset.vmIsWindows === 'true'
        ));
    });
}

function selectVM(vmName, vmZone, vmStatus, machineType, isWindows) {
    state.newConnection.vm = { 
        name: vmName, 
        zone: vmZone, 
        status: vmStatus,
        machineType: machineType,
        isWindows: isWindows
    };
    
    elements.summaryVm.textContent = vmName;
    elements.summaryZone.textContent = vmZone;
    
    renderVMs(state.vms);
    updateButtons();
}

// ==================== Tunnels ====================

async function loadTunnels() {
    try {
        const tunnels = await window.go.main.App.GetTunnels();
        state.tunnels = tunnels || [];
        
        if (state.selectedConnection) {
            updateConnectionStatus();
        }
        renderConnectionsList();
    } catch (error) {
        console.error('Failed to load tunnels:', error);
    }
}

async function startTunnel() {
    if (!state.selectedConnection || state.isStartingTunnel) return;
    
    state.isStartingTunnel = true;
    elements.startTunnelBtn.disabled = true;
    elements.startTunnelBtn.textContent = 'Starting...';
    
    try {
        // Use the connection's fixed port
        const tunnel = await window.go.main.App.StartTunnelForConnection(state.selectedConnection.id);
        
        state.tunnels.unshift(tunnel);
        state.selectedTunnel = tunnel;
        updateConnectionStatus();
        renderConnectionsList();
        showToast(`Tunnel started on port ${tunnel.localPort}`, 'success');
    } catch (error) {
        const errorMsg = error?.message || String(error) || 'Unknown error';
        showToast('Failed to start tunnel: ' + errorMsg, 'error');
    } finally {
        state.isStartingTunnel = false;
        elements.startTunnelBtn.textContent = 'Start Tunnel';
        updateButtons();
    }
}

async function stopTunnel() {
    if (!state.selectedConnection) return;
    
    const activeTunnel = getActiveConnectionTunnel(state.selectedConnection);
    if (!activeTunnel) return;
    
    elements.stopTunnelBtn.disabled = true;
    elements.stopTunnelBtn.textContent = 'Stopping...';
    
    try {
        await window.go.main.App.StopTunnel(activeTunnel.id);
        
        const idx = state.tunnels.findIndex(t => t.id === activeTunnel.id);
        if (idx >= 0) {
            state.tunnels[idx].status = 'stopped';
        }
        
        updateConnectionStatus();
        renderConnectionsList();
        showToast('Tunnel stopped', 'success');
    } catch (error) {
        showToast('Failed to stop tunnel: ' + error.message, 'error');
    } finally {
        elements.stopTunnelBtn.textContent = 'Stop Tunnel';
        updateButtons();
    }
}

async function stopAllTunnels() {
    const activeTunnels = state.tunnels.filter(t => t.status === 'running' || t.status === 'starting');
    if (activeTunnels.length === 0) {
        showToast('No active tunnels to stop', 'info');
        return;
    }
    
    elements.stopAllBtn.disabled = true;
    elements.stopAllBtn.textContent = 'Stopping...';
    
    try {
        const count = await window.go.main.App.StopAllTunnels();
        await loadTunnels();
        showToast(`Stopped ${count} tunnel(s)`, 'success');
    } catch (error) {
        showToast('Failed to stop tunnels: ' + error.message, 'error');
    } finally {
        elements.stopAllBtn.textContent = 'Stop All';
        updateButtons();
    }
}


function copyAddress() {
    if (!state.selectedConnection) return;
    
    // Always use the connection's fixed port
    const address = `localhost:${state.selectedConnection.localPort}`;
    navigator.clipboard.writeText(address).then(() => {
        showToast(`Copied: ${address}`, 'success');
    }).catch(() => {
        showToast('Failed to copy address', 'error');
    });
}

// ==================== Menu Actions ====================

function createWindowsAppBookmark() {
    if (!state.selectedConnection || !state.windowsAppInstalled) return;
    hideOverflowMenu();
    showBookmarkModal();
}

// ==================== Bookmark Modal ====================

function showBookmarkModal() {
    if (!state.selectedConnection) return;
    
    // Set the address
    elements.bookmarkAddress.textContent = `localhost:${state.selectedConnection.localPort}`;
    
    // Reset form
    elements.bookmarkWithPassword.checked = false;
    elements.bookmarkPasswordOptions.classList.add('hidden');
    elements.bookmarkUsername.value = state.selectedConnection.username || 'Administrator';
    elements.bookmarkSaveKeychain.checked = true;
    
    elements.bookmarkModal.classList.remove('hidden');
}

function hideBookmarkModal() {
    elements.bookmarkModal.classList.add('hidden');
}

async function executeBookmarkCreation() {
    if (!state.selectedConnection) return;
    
    const withPassword = elements.bookmarkWithPassword.checked;
    const port = state.selectedConnection.localPort;
    
    hideBookmarkModal();
    
    if (withPassword) {
        // Generate password and create bookmark with credentials
        const username = elements.bookmarkUsername.value.trim() || 'Administrator';
        const saveToKeychain = elements.bookmarkSaveKeychain.checked;
        
        showLoadingModal('Generating Windows password...\nThis may take up to 90 seconds.');
        
        try {
            const result = await window.go.main.App.GenerateWindowsPassword({
                connectionId: state.selectedConnection.id,
                username: username,
                saveToKeychain: saveToKeychain,
                updateBookmark: true // Always update bookmark since that's the purpose
            });
            
            hideLoadingModal();
            
            if (result.success) {
                // Store password temporarily for display
                generatedPassword = result.password;
                
                // Update connection state
                state.selectedConnection.username = result.username;
                state.selectedConnection.hasBookmark = true;
                state.selectedConnection.bookmarkHasCreds = result.bookmarkUpdated;
                
                // Update the connection in the list
                const connIndex = state.connections.findIndex(c => c.id === state.selectedConnection.id);
                if (connIndex >= 0) {
                    state.connections[connIndex].username = result.username;
                    state.connections[connIndex].hasBookmark = true;
                    state.connections[connIndex].bookmarkHasCreds = result.bookmarkUpdated;
                }
                
                // Update UI
                const detailUsername = document.getElementById('detail-username');
                if (detailUsername) {
                    detailUsername.textContent = result.username;
                }
                updateBookmarkStatusDisplay(state.selectedConnection);
                
                // Show result modal
                showPasswordResultModal(result);
            } else {
                showToast('Failed to generate password: ' + result.error, 'error');
            }
        } catch (error) {
            hideLoadingModal();
            const errorMsg = error?.message || String(error) || 'Unknown error';
            showToast('Failed to generate password: ' + errorMsg, 'error');
        }
    } else {
        // Create bookmark without credentials
        try {
            const result = await window.go.main.App.CreateWindowsAppBookmark(
                state.selectedConnection.projectId,
                state.selectedConnection.vmName,
                state.selectedConnection.zone,
                port
            );
            
            if (result.success) {
                // Update connection state (bookmark without credentials)
                state.selectedConnection.hasBookmark = true;
                
                // Update the connection in the list
                const connIndex = state.connections.findIndex(c => c.id === state.selectedConnection.id);
                if (connIndex >= 0) {
                    state.connections[connIndex].hasBookmark = true;
                }
                
                // Update bookmark status in backend
                try {
                    await window.go.main.App.UpdateConnectionBookmarkStatus(
                        state.selectedConnection.id,
                        true,
                        false // no credentials
                    );
                } catch (e) {
                    console.error('Failed to update bookmark status:', e);
                }
                
                updateBookmarkStatusDisplay(state.selectedConnection);
                showToast('Windows App bookmark created', 'success');
            } else {
                showToast('Failed to create bookmark: ' + result.error, 'error');
            }
        } catch (error) {
            const errorMsg = error?.message || String(error) || 'Unknown error';
            showToast('Failed to create bookmark: ' + errorMsg, 'error');
        }
    }
}

// ==================== Password Generation ====================

let generatedPassword = ''; // Temporary storage for the generated password

function showPasswordModal() {
    if (!state.selectedConnection) return;
    
    hideOverflowMenu();
    
    // Pre-fill username from connection or default to Administrator
    elements.passwordUsername.value = state.selectedConnection.username || 'Administrator';
    
    // Reset checkboxes
    elements.passwordSaveKeychain.checked = true;
    elements.passwordUpdateBookmark.checked = state.windowsAppInstalled;
    
    // Handle Windows App availability
    if (!state.windowsAppInstalled) {
        elements.passwordUpdateBookmark.disabled = true;
        elements.passwordUpdateBookmark.checked = false;
        elements.bookmarkWarning.classList.remove('hidden');
    } else {
        elements.passwordUpdateBookmark.disabled = false;
        elements.bookmarkWarning.classList.add('hidden');
    }
    
    elements.passwordModal.classList.remove('hidden');
}

function hidePasswordModal() {
    elements.passwordModal.classList.add('hidden');
}

function showLoadingModal(message) {
    elements.loadingMessage.textContent = message;
    elements.loadingModal.classList.remove('hidden');
}

function hideLoadingModal() {
    elements.loadingModal.classList.add('hidden');
}

function showPasswordResultModal(result) {
    generatedPassword = result.password;
    
    elements.resultUsername.textContent = result.username;
    elements.resultPassword.textContent = '••••••••••••';
    elements.resultPassword.dataset.password = result.password;
    
    // Show/hide status items
    if (result.keychainSaved) {
        elements.resultKeychain.classList.remove('hidden');
    } else {
        elements.resultKeychain.classList.add('hidden');
    }
    
    if (result.bookmarkUpdated) {
        elements.resultBookmark.classList.remove('hidden');
    } else {
        elements.resultBookmark.classList.add('hidden');
    }
    
    elements.passwordResultModal.classList.remove('hidden');
}

function hidePasswordResultModal() {
    elements.passwordResultModal.classList.add('hidden');
    // Clear password from memory
    generatedPassword = '';
    elements.resultPassword.textContent = '••••••••••••';
    elements.resultPassword.dataset.password = '';
}

function togglePasswordVisibility() {
    const passwordEl = elements.resultPassword;
    if (passwordEl.textContent === '••••••••••••') {
        passwordEl.textContent = passwordEl.dataset.password;
    } else {
        passwordEl.textContent = '••••••••••••';
    }
}

async function generateWindowsPassword() {
    showPasswordModal();
}

async function executePasswordGeneration() {
    if (!state.selectedConnection) return;
    
    const username = elements.passwordUsername.value.trim() || 'Administrator';
    const saveToKeychain = elements.passwordSaveKeychain.checked;
    const updateBookmark = elements.passwordUpdateBookmark.checked && state.windowsAppInstalled;
    
    // No need to check for running tunnel - we use the connection's fixed port
    
    hidePasswordModal();
    showLoadingModal('Generating Windows password...\nThis may take up to 90 seconds.');
    
    try {
        const result = await window.go.main.App.GenerateWindowsPassword({
            connectionId: state.selectedConnection.id,
            username: username,
            saveToKeychain: saveToKeychain,
            updateBookmark: updateBookmark
        });
        
        hideLoadingModal();
        
        if (result.success) {
            // Update local connection state
            state.selectedConnection.username = result.username;
            if (result.bookmarkUpdated) {
                state.selectedConnection.hasBookmark = true;
                state.selectedConnection.bookmarkHasCreds = true;
            }
            
            // Update the connection in the list
            const connIndex = state.connections.findIndex(c => c.id === state.selectedConnection.id);
            if (connIndex >= 0) {
                state.connections[connIndex].username = result.username;
                if (result.bookmarkUpdated) {
                    state.connections[connIndex].hasBookmark = true;
                    state.connections[connIndex].bookmarkHasCreds = true;
                }
            }
            
            // Update UI
            const detailUsername = document.getElementById('detail-username');
            if (detailUsername) {
                detailUsername.textContent = result.username;
            }
            updateBookmarkStatusDisplay(state.selectedConnection);
            
            showPasswordResultModal(result);
        } else {
            showToast('Failed to generate password: ' + result.error, 'error');
        }
    } catch (error) {
        hideLoadingModal();
        showToast('Failed to generate password: ' + error.message, 'error');
    }
}

function copyCredential(elementId) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    let text = element.textContent;
    // For password, use the stored value if it's masked
    if (elementId === 'result-password' && text === '••••••••••••') {
        text = element.dataset.password;
    }
    
    navigator.clipboard.writeText(text).then(() => {
        showToast('Copied to clipboard', 'success');
    }).catch(() => {
        showToast('Failed to copy', 'error');
    });
}

// ==================== UI Helpers ====================

function showView(view) {
    state.currentView = view;
    
    elements.connectionDetailsView.classList.add('hidden');
    elements.newConnectionView.classList.add('hidden');
    elements.emptyStateView.classList.add('hidden');
    
    switch (view) {
        case 'details':
            elements.connectionDetailsView.classList.remove('hidden');
            break;
        case 'new':
            elements.newConnectionView.classList.remove('hidden');
            break;
        case 'empty':
            elements.emptyStateView.classList.remove('hidden');
            break;
    }
}

function updateButtons() {
    // Open Windows App button
    elements.openWindowsAppBtn.disabled = !state.windowsAppInstalled;
    elements.openWindowsAppBtn.title = state.windowsAppInstalled ? 'Open Windows App' : 'Windows App not installed';
    
    // Global tunnel buttons
    const hasActiveTunnels = state.tunnels.some(t => t.status === 'running' || t.status === 'starting');
    elements.stopAllBtn.disabled = !hasActiveTunnels;
    
    // Details view buttons
    if (state.selectedConnection) {
        const activeTunnel = getActiveConnectionTunnel(state.selectedConnection);
        const hasActive = activeTunnel != null;
        
        elements.startTunnelBtn.disabled = state.isStartingTunnel || hasActive;
        elements.stopTunnelBtn.disabled = !hasActive;
        elements.copyAddressBtn.disabled = false; // Always enabled - port is fixed
        
        // Menu items
        elements.menuCreateBookmark.disabled = !state.windowsAppInstalled;
    }
    
    // New connection form
    const canSave = state.newConnection.project && state.newConnection.vm && state.newConnection.vm.isWindows;
    elements.saveConnectionBtn.disabled = !canSave;
    
    // Update save button tooltip
    if (state.newConnection.vm && !state.newConnection.vm.isWindows) {
        elements.saveConnectionBtn.title = 'Only Windows VMs can be saved';
    } else {
        elements.saveConnectionBtn.title = '';
    }
}

function updateLogsUI(tunnel) {
    if (!tunnel?.logs?.length) {
        elements.logsContainer.innerHTML = '<div class="log-placeholder">No logs yet...</div>';
        return;
    }
    
    elements.logsContainer.innerHTML = tunnel.logs.map(log => 
        `<div class="log-entry">${escapeHtml(log)}</div>`
    ).join('');
    elements.logsContainer.scrollTop = elements.logsContainer.scrollHeight;
}

function toggleOverflowMenu() {
    elements.overflowMenu.classList.toggle('hidden');
}

function hideOverflowMenu() {
    elements.overflowMenu.classList.add('hidden');
}

function startStatusPolling() {
    setInterval(async () => {
        if (state.tunnels.length === 0 && !state.selectedConnection) return;
        
        try {
            const tunnels = await window.go.main.App.GetTunnels();
            state.tunnels = tunnels || [];
            
            if (state.selectedConnection) {
                updateConnectionStatus();
            }
            renderConnectionsList();
            updateButtons();
        } catch (error) {
            console.error('Polling error:', error);
        }
    }, 1000);
}

// ==================== Event Listeners ====================

function setupEventListeners() {
    // Auth
    elements.authBtn.addEventListener('click', runAuthentication);
    elements.installGcloudBtn.addEventListener('click', openGcloudInstallPage);
    elements.checkGcloudBtn.addEventListener('click', recheckGcloud);
    
    // Top bar
    elements.openWindowsAppBtn.addEventListener('click', openWindowsApp);
    
    // Connections panel
    elements.newConnectionBtn.addEventListener('click', showNewConnectionForm);
    
    // Details view
    elements.menuBtn.addEventListener('click', toggleOverflowMenu);
    elements.menuCreateBookmark.addEventListener('click', createWindowsAppBookmark);
    elements.menuGeneratePassword.addEventListener('click', generateWindowsPassword);
    elements.menuDeleteConnection.addEventListener('click', deleteConnection);
    elements.startTunnelBtn.addEventListener('click', startTunnel);
    elements.stopTunnelBtn.addEventListener('click', stopTunnel);
    elements.copyAddressBtn.addEventListener('click', copyAddress);
    elements.clearLogsBtn.addEventListener('click', () => {
        elements.logsContainer.innerHTML = '<div class="log-placeholder">Logs cleared...</div>';
    });
    
    // New connection view
    elements.cancelConnectionBtn.addEventListener('click', cancelNewConnection);
    elements.saveConnectionBtn.addEventListener('click', saveConnection);
    
    // Panel footer buttons
    elements.stopAllBtn.addEventListener('click', stopAllTunnels);
    
    // Project search
    let projectSearchTimeout;
    elements.projectSearch.addEventListener('input', (e) => {
        clearTimeout(projectSearchTimeout);
        projectSearchTimeout = setTimeout(() => loadProjects(e.target.value), 300);
    });
    
    // VM search
    let vmSearchTimeout;
    elements.vmSearch.addEventListener('input', (e) => {
        if (!state.newConnection.project) return;
        clearTimeout(vmSearchTimeout);
        vmSearchTimeout = setTimeout(() => loadVMs(state.newConnection.project.id, e.target.value), 300);
    });
    
    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
        if (!elements.menuBtn.contains(e.target) && !elements.overflowMenu.contains(e.target)) {
            hideOverflowMenu();
        }
    });
    
    // Password modal events
    elements.passwordModalClose.addEventListener('click', hidePasswordModal);
    elements.passwordCancelBtn.addEventListener('click', hidePasswordModal);
    elements.passwordGenerateBtn.addEventListener('click', executePasswordGeneration);
    elements.passwordModal.querySelector('.modal-backdrop').addEventListener('click', hidePasswordModal);
    
    // Password result modal events
    elements.passwordDoneBtn.addEventListener('click', hidePasswordResultModal);
    elements.togglePasswordBtn.addEventListener('click', togglePasswordVisibility);
    elements.passwordResultModal.querySelector('.modal-backdrop').addEventListener('click', hidePasswordResultModal);
    
    // Copy buttons
    document.querySelectorAll('.btn-copy').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.dataset.copy;
            if (targetId) {
                copyCredential(targetId);
            }
        });
    });
    
    // Confirm modal events
    elements.confirmCancelBtn.addEventListener('click', () => hideConfirm(false));
    elements.confirmOkBtn.addEventListener('click', () => hideConfirm(true));
    elements.confirmModal.querySelector('.modal-backdrop').addEventListener('click', () => hideConfirm(false));
    
    // Bookmark modal events
    elements.bookmarkModalClose.addEventListener('click', hideBookmarkModal);
    elements.bookmarkCancelBtn.addEventListener('click', hideBookmarkModal);
    elements.bookmarkCreateBtn.addEventListener('click', executeBookmarkCreation);
    elements.bookmarkModal.querySelector('.modal-backdrop').addEventListener('click', hideBookmarkModal);
    elements.bookmarkWithPassword.addEventListener('change', (e) => {
        if (e.target.checked) {
            elements.bookmarkPasswordOptions.classList.remove('hidden');
        } else {
            elements.bookmarkPasswordOptions.classList.add('hidden');
        }
    });
}

// ==================== Utilities ====================

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize
document.addEventListener('DOMContentLoaded', init);
