// IAP Tunnel Manager - Frontend JavaScript

// State
const state = {
    selectedProject: null,
    selectedVM: null,
    tunnels: [],           // All tunnels
    selectedTunnel: null,  // Currently selected tunnel in the list
    projects: [],
    vms: [],
    favorites: [],         // Saved favorites
    windowsAppInstalled: false,
    lastConnection: null   // Last used connection
};

// DOM Elements
const elements = {
    authBanner: document.getElementById('auth-status'),
    authMessage: document.querySelector('.auth-message'),
    authBtn: document.getElementById('auth-btn'),
    authBtnText: document.querySelector('.auth-btn-text'),
    authBtnSpinner: document.querySelector('.auth-btn-spinner'),
    windowsAppBanner: document.getElementById('windows-app-status'),
    windowsAppMessage: document.querySelector('.warning-message'),
    connectionStatus: document.getElementById('connection-status'),
    projectSearch: document.getElementById('project-search'),
    vmSearch: document.getElementById('vm-search'),
    projectsList: document.getElementById('projects-list'),
    vmsList: document.getElementById('vms-list'),
    selectedProject: document.getElementById('selected-project'),
    selectedVM: document.getElementById('selected-vm'),
    selectedZone: document.getElementById('selected-zone'),
    startTunnelBtn: document.getElementById('start-tunnel-btn'),
    startTunnelBookmarkBtn: document.getElementById('start-tunnel-bookmark-btn'),
    openWindowsAppBtn: document.getElementById('open-windows-app-btn'),
    tunnelsList: document.getElementById('tunnels-list'),
    stopAllBtn: document.getElementById('stop-all-btn'),
    clearStoppedBtn: document.getElementById('clear-stopped-btn'),
    selectedTunnelPanel: document.getElementById('selected-tunnel-panel'),
    tunnelVmName: document.getElementById('tunnel-vm-name'),
    tunnelAddress: document.getElementById('tunnel-address'),
    tunnelStatus: document.getElementById('tunnel-status'),
    stopTunnelBtn: document.getElementById('stop-tunnel-btn'),
    copyAddressBtn: document.getElementById('copy-address-btn'),
    removeTunnelBtn: document.getElementById('remove-tunnel-btn'),
    clearLogsBtn: document.getElementById('clear-logs-btn'),
    logsContainer: document.getElementById('logs-container'),
    // Favorites elements
    favoritesSection: document.getElementById('favorites-section'),
    favoritesList: document.getElementById('favorites-list'),
    toggleFavoriteBtn: document.getElementById('toggle-favorite-btn')
};

// Initialize
async function init() {
    // Check authentication
    await checkAuth();
    
    // Check Windows App availability
    await checkWindowsApp();
    
    // Load favorites
    await loadFavorites();
    
    // Load last connection
    await loadLastConnection();
    
    // Load projects
    await loadProjects();
    
    // Restore last connection if available
    await restoreLastConnection();
    
    // Load existing tunnels
    await loadTunnels();
    
    // Setup event listeners
    setupEventListeners();
    
    // Start polling for tunnel status
    startStatusPolling();
}

// Check authentication status
async function checkAuth() {
    try {
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

// Show auth error banner
function showAuthError(message) {
    elements.authBanner.classList.remove('hidden');
    elements.authBanner.classList.remove('authenticating');
    elements.authMessage.textContent = message;
    resetAuthButton();
}

// Hide auth error banner
function hideAuthError() {
    elements.authBanner.classList.add('hidden');
    elements.authBanner.classList.remove('authenticating');
    resetAuthButton();
}

// Reset auth button to default state
function resetAuthButton() {
    elements.authBtn.disabled = false;
    elements.authBtnText.textContent = 'Authenticate (ADC)';
    elements.authBtnSpinner.classList.add('hidden');
}

// Run ADC authentication
async function runAuthentication() {
    // First check if gcloud is available
    try {
        const gcloudInfo = await window.go.main.App.FindGcloud();
        if (!gcloudInfo.found) {
            showAuthError(gcloudInfo.error);
            return;
        }
    } catch (error) {
        showAuthError('Failed to find gcloud: ' + error.message);
        return;
    }
    
    // Update UI to show authenticating state
    elements.authBtn.disabled = true;
    elements.authBtnText.textContent = 'Authenticating...';
    elements.authBtnSpinner.classList.remove('hidden');
    elements.authBanner.classList.add('authenticating');
    elements.authMessage.textContent = 'Opening browser for Google authentication. Please complete the sign-in flow...';
    
    try {
        // Run the authentication (this will open browser and wait)
        const result = await window.go.main.App.RunADCLogin();
        
        if (result.status === 'success') {
            // Authentication successful
            hideAuthError();
            showToast('Successfully authenticated with Google Cloud', 'success');
            
            // Reload projects now that we're authenticated
            await loadProjects();
            
            // Try to restore last connection
            await restoreLastConnection();
        } else {
            // Authentication failed
            showAuthError(result.message);
            showToast('Authentication failed', 'error');
        }
    } catch (error) {
        showAuthError('Authentication error: ' + error.message);
        showToast('Authentication error', 'error');
    }
}

// Check Windows App availability
async function checkWindowsApp() {
    try {
        const result = await window.go.main.App.CheckWindowsApp();
        state.windowsAppInstalled = result.installed;
        
        if (!result.installed) {
            showWindowsAppWarning(result.error || 'Windows App not found');
        } else {
            hideWindowsAppWarning();
        }
    } catch (error) {
        state.windowsAppInstalled = false;
        showWindowsAppWarning('Failed to check Windows App: ' + error.message);
    }
    
    updateButtons();
}

// Show Windows App warning banner
function showWindowsAppWarning(message) {
    elements.windowsAppBanner.classList.remove('hidden');
    if (elements.windowsAppMessage) {
        elements.windowsAppMessage.textContent = message;
    }
}

// Hide Windows App warning banner
function hideWindowsAppWarning() {
    elements.windowsAppBanner.classList.add('hidden');
}

// Load favorites from backend
async function loadFavorites() {
    try {
        const favorites = await window.go.main.App.GetFavorites();
        state.favorites = favorites || [];
        renderFavorites();
    } catch (error) {
        console.error('Failed to load favorites:', error);
        state.favorites = [];
    }
}

// Render favorites list
function renderFavorites() {
    if (!state.favorites || state.favorites.length === 0) {
        elements.favoritesList.innerHTML = '<div class="favorites-empty">No favorites yet. Star a VM to add it here.</div>';
        elements.favoritesSection.classList.add('hidden');
        return;
    }
    
    elements.favoritesSection.classList.remove('hidden');
    elements.favoritesList.innerHTML = state.favorites.map(fav => `
        <div class="favorite-item" 
             data-favorite-id="${fav.id}"
             data-project-id="${fav.projectId}"
             data-project-name="${escapeHtml(fav.projectName || fav.projectId)}"
             data-instance-name="${fav.instanceName}"
             data-zone="${fav.zone}">
            <span class="star">★</span>
            <span class="name" title="${escapeHtml(fav.displayName)}">${escapeHtml(fav.displayName)}</span>
            <span class="zone">${escapeHtml(fav.zone)}</span>
            <button class="remove-btn" data-favorite-id="${fav.id}" title="Remove from favorites">×</button>
        </div>
    `).join('');
    
    // Add click handlers for favorites
    elements.favoritesList.querySelectorAll('.favorite-item').forEach(item => {
        item.addEventListener('click', (e) => {
            // Don't trigger if clicking remove button
            if (e.target.classList.contains('remove-btn')) return;
            selectFavorite(
                item.dataset.projectId,
                item.dataset.projectName,
                item.dataset.instanceName,
                item.dataset.zone
            );
        });
    });
    
    // Add click handlers for remove buttons
    elements.favoritesList.querySelectorAll('.remove-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeFavorite(btn.dataset.favoriteId);
        });
    });
}

// Select a favorite
async function selectFavorite(projectId, projectName, instanceName, zone) {
    // Select the project first
    state.selectedProject = { id: projectId, name: projectName };
    elements.selectedProject.textContent = projectId;
    elements.projectSearch.value = '';
    elements.vmSearch.disabled = false;
    elements.vmSearch.value = '';
    
    // Re-render projects to show selection and scroll into view
    renderProjects(state.projects);
    
    // Load VMs for this project
    await loadVMs(projectId);
    
    // Find and select the VM (try exact match first, then partial zone match)
    let vm = state.vms.find(v => v.name === instanceName && v.zone === zone);
    if (!vm) {
        // Try matching just by name if zone format differs
        vm = state.vms.find(v => v.name === instanceName);
    }
    
    if (vm) {
        // Update state and UI
        state.selectedVM = { name: vm.name, zone: vm.zone, status: vm.status };
        elements.selectedVM.textContent = vm.name;
        elements.selectedZone.textContent = vm.zone;
        
        // Re-render VMs to show selection and scroll into view
        renderVMs(state.vms);
        
        // Update favorite button
        updateFavoriteButton();
        
        showToast(`Selected ${vm.name} in ${projectName || projectId}`, 'success');
    } else {
        // VM not found - might have been deleted
        state.selectedVM = { name: instanceName, zone: zone, status: 'UNKNOWN' };
        elements.selectedVM.textContent = instanceName;
        elements.selectedZone.textContent = zone;
        
        // Re-render VMs (selection won't show but that's expected)
        renderVMs(state.vms);
        
        // Update favorite button
        updateFavoriteButton();
        
        showToast(`VM ${instanceName} not found in project - it may have been deleted`, 'error');
    }
    
    updateButtons();
}

// Toggle favorite for selected VM
async function toggleFavorite() {
    if (!state.selectedProject || !state.selectedVM) {
        showToast('Please select a VM first', 'error');
        return;
    }
    
    const isFav = await checkIsFavorite();
    
    if (isFav) {
        // Remove from favorites
        const fav = state.favorites.find(f => 
            f.projectId === state.selectedProject.id && 
            f.instanceName === state.selectedVM.name && 
            f.zone === state.selectedVM.zone
        );
        if (fav) {
            await removeFavorite(fav.id);
        }
    } else {
        // Add to favorites
        await addFavorite();
    }
}

// Check if current selection is a favorite
async function checkIsFavorite() {
    if (!state.selectedProject || !state.selectedVM) return false;
    
    try {
        return await window.go.main.App.IsFavorite(
            state.selectedProject.id,
            state.selectedVM.name,
            state.selectedVM.zone
        );
    } catch (error) {
        return false;
    }
}

// Add current selection to favorites
async function addFavorite() {
    if (!state.selectedProject || !state.selectedVM) return;
    
    const displayName = `${state.selectedVM.name}`;
    
    try {
        await window.go.main.App.AddFavorite(
            displayName,
            state.selectedProject.id,
            state.selectedProject.name,
            state.selectedVM.name,
            state.selectedVM.zone,
            3389, // Default RDP port
            0     // No preferred local port
        );
        
        await loadFavorites();
        updateFavoriteButton();
        showToast(`Added ${state.selectedVM.name} to favorites`, 'success');
    } catch (error) {
        showToast('Failed to add favorite: ' + error.message, 'error');
    }
}

// Remove a favorite
async function removeFavorite(favoriteId) {
    try {
        await window.go.main.App.RemoveFavorite(favoriteId);
        await loadFavorites();
        updateFavoriteButton();
        showToast('Removed from favorites', 'success');
    } catch (error) {
        showToast('Failed to remove favorite: ' + error.message, 'error');
    }
}

// Update favorite button state
async function updateFavoriteButton() {
    if (!state.selectedProject || !state.selectedVM) {
        elements.toggleFavoriteBtn.disabled = true;
        elements.toggleFavoriteBtn.classList.remove('favorited');
        elements.toggleFavoriteBtn.querySelector('.star-icon').textContent = '☆';
        elements.toggleFavoriteBtn.title = 'Select a VM to add to favorites';
        return;
    }
    
    elements.toggleFavoriteBtn.disabled = false;
    
    const isFav = await checkIsFavorite();
    if (isFav) {
        elements.toggleFavoriteBtn.classList.add('favorited');
        elements.toggleFavoriteBtn.querySelector('.star-icon').textContent = '★';
        elements.toggleFavoriteBtn.title = 'Remove from favorites';
    } else {
        elements.toggleFavoriteBtn.classList.remove('favorited');
        elements.toggleFavoriteBtn.querySelector('.star-icon').textContent = '☆';
        elements.toggleFavoriteBtn.title = 'Add to favorites';
    }
}

// Load last connection from backend
async function loadLastConnection() {
    try {
        const lastConn = await window.go.main.App.GetLastConnection();
        state.lastConnection = lastConn;
    } catch (error) {
        console.error('Failed to load last connection:', error);
        state.lastConnection = null;
    }
}

// Restore last connection on startup
async function restoreLastConnection() {
    if (!state.lastConnection) return;
    
    const lc = state.lastConnection;
    
    // Check if the project exists in our list
    const project = state.projects.find(p => p.id === lc.projectId);
    if (!project) {
        // Project not found, clear last connection
        console.log('Last connection project not found:', lc.projectId);
        return;
    }
    
    // Select the project
    state.selectedProject = { id: lc.projectId, name: lc.projectName || project.name };
    elements.selectedProject.textContent = lc.projectId;
    elements.projectSearch.value = '';
    elements.vmSearch.disabled = false;
    elements.vmSearch.value = '';
    
    // Re-render projects to show selection
    renderProjects(state.projects);
    
    // Load VMs for this project
    await loadVMs(lc.projectId);
    
    // Find and select the VM (try exact match first, then partial zone match)
    let vm = state.vms.find(v => v.name === lc.instanceName && v.zone === lc.zone);
    if (!vm) {
        // Try matching just by name if zone format differs
        vm = state.vms.find(v => v.name === lc.instanceName);
    }
    
    if (vm) {
        // Update state and UI directly (don't call selectVM to avoid re-saving)
        state.selectedVM = { name: vm.name, zone: vm.zone, status: vm.status };
        elements.selectedVM.textContent = vm.name;
        elements.selectedZone.textContent = vm.zone;
        
        // Re-render VMs to show selection
        renderVMs(state.vms);
        
        // Update favorite button
        updateFavoriteButton();
    } else {
        // VM not found - show as selected but mark as potentially invalid
        state.selectedVM = { name: lc.instanceName, zone: lc.zone, status: 'UNKNOWN' };
        elements.selectedVM.textContent = lc.instanceName;
        elements.selectedZone.textContent = lc.zone;
        
        // Re-render VMs (selection won't show but that's expected)
        renderVMs(state.vms);
        
        // Update favorite button
        updateFavoriteButton();
    }
    
    updateButtons();
}

// Save last connection
async function saveLastConnection() {
    if (!state.selectedProject || !state.selectedVM) return;
    
    try {
        await window.go.main.App.SaveLastConnection(
            state.selectedProject.id,
            state.selectedProject.name,
            state.selectedVM.name,
            state.selectedVM.zone,
            3389, // Default RDP port
            0     // No preferred local port
        );
    } catch (error) {
        console.error('Failed to save last connection:', error);
    }
}

// Load projects
async function loadProjects(filter = '') {
    elements.projectsList.innerHTML = '<div class="loading">Loading projects...</div>';
    
    try {
        const projects = await window.go.main.App.ListProjects(filter);
        state.projects = projects || [];
        renderProjects(state.projects);
    } catch (error) {
        elements.projectsList.innerHTML = `<div class="error-message">Failed to load projects: ${error.message}</div>`;
    }
}

// Render projects list
function renderProjects(projects) {
    if (!projects || projects.length === 0) {
        elements.projectsList.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📁</div>
                <div class="empty-state-text">No projects found</div>
            </div>
        `;
        return;
    }
    
    elements.projectsList.innerHTML = projects.map(project => {
        const isSelected = state.selectedProject && state.selectedProject.id === project.id;
        return `
            <div class="list-item ${isSelected ? 'selected' : ''}" 
                 data-project-id="${project.id}" 
                 data-project-name="${escapeHtml(project.name)}">
                <div class="list-item-title">${escapeHtml(project.name)}</div>
                <div class="list-item-subtitle">${escapeHtml(project.id)}</div>
            </div>
        `;
    }).join('');
    
    // Add click handlers
    elements.projectsList.querySelectorAll('.list-item').forEach(item => {
        item.addEventListener('click', () => selectProject(item.dataset.projectId, item.dataset.projectName));
    });
    
    // Scroll selected project into view
    scrollSelectedIntoView(elements.projectsList);
}

// Scroll selected item into view within a container
function scrollSelectedIntoView(container) {
    const selectedItem = container.querySelector('.list-item.selected');
    if (selectedItem) {
        selectedItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

// Select a project
async function selectProject(projectId, projectName) {
    state.selectedProject = { id: projectId, name: projectName };
    state.selectedVM = null;
    
    // Update UI
    elements.selectedProject.textContent = projectId;
    elements.selectedVM.textContent = '-';
    elements.selectedZone.textContent = '-';
    elements.vmSearch.disabled = false;
    elements.vmSearch.value = '';
    
    // Re-render projects to show selection
    renderProjects(state.projects);
    
    // Load VMs
    await loadVMs(projectId);
    
    // Update favorite button (will be disabled since no VM selected)
    updateFavoriteButton();
    
    updateButtons();
}

// Load VMs for a project
async function loadVMs(projectId, filter = '') {
    elements.vmsList.innerHTML = '<div class="loading">Loading VMs...</div>';
    
    try {
        const vms = await window.go.main.App.ListVMs(projectId, filter);
        state.vms = vms || [];
        renderVMs(state.vms);
    } catch (error) {
        elements.vmsList.innerHTML = `<div class="error-message">Failed to load VMs: ${error.message}</div>`;
    }
}

// Render VMs list
function renderVMs(vms) {
    if (!vms || vms.length === 0) {
        elements.vmsList.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🖥️</div>
                <div class="empty-state-text">No VMs found in this project</div>
            </div>
        `;
        return;
    }
    
    elements.vmsList.innerHTML = vms.map(vm => {
        // Check if this VM is selected
        const isSelected = state.selectedVM && 
            state.selectedVM.name === vm.name && 
            state.selectedVM.zone === vm.zone;
        const statusLower = (vm.status || 'unknown').toLowerCase();
        
        return `
            <div class="list-item ${isSelected ? 'selected' : ''}" 
                 data-vm-name="${vm.name}" 
                 data-vm-zone="${vm.zone}"
                 data-vm-status="${vm.status || 'UNKNOWN'}">
                <div class="list-item-title">
                    ${escapeHtml(vm.name)}
                    <span class="vm-status ${statusLower}">${vm.status || 'UNKNOWN'}</span>
                </div>
                <div class="list-item-subtitle">
                    ${escapeHtml(vm.zone)}${vm.privateIp ? ' • ' + vm.privateIp : ''}
                </div>
            </div>
        `;
    }).join('');
    
    // Add click handlers
    elements.vmsList.querySelectorAll('.list-item').forEach(item => {
        item.addEventListener('click', () => selectVM(item.dataset.vmName, item.dataset.vmZone, item.dataset.vmStatus));
    });
    
    // Scroll selected VM into view
    scrollSelectedIntoView(elements.vmsList);
}

// Select a VM
function selectVM(vmName, vmZone, vmStatus) {
    state.selectedVM = { name: vmName, zone: vmZone, status: vmStatus };
    
    // Update UI
    elements.selectedVM.textContent = vmName;
    elements.selectedZone.textContent = vmZone;
    
    // Re-render VMs to show selection
    renderVMs(state.vms);
    
    // Save as last connection
    saveLastConnection();
    
    // Update favorite button
    updateFavoriteButton();
    
    updateButtons();
}

// Load tunnels from backend
async function loadTunnels() {
    try {
        const tunnels = await window.go.main.App.GetTunnels();
        state.tunnels = tunnels || [];
        renderTunnelsList();
    } catch (error) {
        console.error('Failed to load tunnels:', error);
    }
}

// Render tunnels list
function renderTunnelsList() {
    if (!state.tunnels || state.tunnels.length === 0) {
        elements.tunnelsList.innerHTML = '<div class="tunnels-empty">No active tunnels</div>';
        elements.selectedTunnelPanel.style.display = 'none';
        return;
    }
    
    elements.tunnelsList.innerHTML = state.tunnels.map(tunnel => `
        <div class="tunnel-item ${state.selectedTunnel?.id === tunnel.id ? 'selected' : ''}" 
             data-tunnel-id="${tunnel.id}">
            <div class="tunnel-item-info">
                <span class="tunnel-item-name">${escapeHtml(tunnel.vmName)}</span>
                <span class="tunnel-item-address">localhost:${tunnel.localPort}</span>
            </div>
            <span class="tunnel-item-status ${tunnel.status}">${tunnel.status}</span>
        </div>
    `).join('');
    
    // Add click handlers
    elements.tunnelsList.querySelectorAll('.tunnel-item').forEach(item => {
        item.addEventListener('click', () => selectTunnel(item.dataset.tunnelId));
    });
}

// Select a tunnel from the list
function selectTunnel(tunnelId) {
    const tunnel = state.tunnels.find(t => t.id === tunnelId);
    if (!tunnel) return;
    
    state.selectedTunnel = tunnel;
    
    // Update selected tunnel panel
    elements.selectedTunnelPanel.style.display = 'block';
    elements.tunnelVmName.textContent = `${tunnel.vmName} (${tunnel.zone})`;
    elements.tunnelAddress.textContent = `localhost:${tunnel.localPort}`;
    elements.tunnelStatus.textContent = tunnel.status;
    elements.tunnelStatus.className = `tunnel-status-badge ${tunnel.status}`;
    
    // Update logs
    updateLogsUI(tunnel);
    
    // Re-render list to show selection
    renderTunnelsList();
    
    updateButtons();
}

// Update buttons state
function updateButtons() {
    const canStart = state.selectedProject && state.selectedVM;
    const hasSelectedTunnel = state.selectedTunnel !== null;
    const tunnelIsActive = hasSelectedTunnel && 
        (state.selectedTunnel.status === 'running' || state.selectedTunnel.status === 'starting');
    const tunnelIsRunning = hasSelectedTunnel && state.selectedTunnel.status === 'running';
    const tunnelIsStopped = hasSelectedTunnel && 
        (state.selectedTunnel.status === 'stopped' || state.selectedTunnel.status === 'error');
    
    // Start buttons
    elements.startTunnelBtn.disabled = !canStart;
    elements.startTunnelBookmarkBtn.disabled = !canStart || !state.windowsAppInstalled;
    elements.openWindowsAppBtn.disabled = !state.windowsAppInstalled;
    
    // Selected tunnel buttons
    elements.stopTunnelBtn.disabled = !tunnelIsActive;
    elements.copyAddressBtn.disabled = !tunnelIsRunning;
    elements.removeTunnelBtn.disabled = !tunnelIsStopped;
    
    // Update tooltip for bookmark button when Windows App not installed
    if (!state.windowsAppInstalled) {
        elements.startTunnelBookmarkBtn.title = 'Windows App not installed - Install from Mac App Store';
    } else {
        elements.startTunnelBookmarkBtn.title = 'Start tunnel and create Windows App bookmark';
    }
}

// Start tunnel
async function startTunnel() {
    if (!state.selectedProject || !state.selectedVM) {
        showToast('Please select a project and VM first', 'error');
        return;
    }
    
    elements.startTunnelBtn.disabled = true;
    elements.startTunnelBtn.textContent = 'Starting...';
    
    try {
        const tunnel = await window.go.main.App.StartTunnel(
            state.selectedProject.id,
            state.selectedVM.name,
            state.selectedVM.zone,
            0 // Auto-select port
        );
        
        // Add to tunnels list and select it
        state.tunnels.unshift(tunnel);
        state.selectedTunnel = tunnel;
        renderTunnelsList();
        selectTunnel(tunnel.id);
        
        showToast(`Tunnel started on port ${tunnel.localPort}`, 'success');
    } catch (error) {
        showToast('Failed to start tunnel: ' + error.message, 'error');
    } finally {
        elements.startTunnelBtn.textContent = 'Start Tunnel';
        updateButtons();
    }
}

// Start tunnel with Windows App bookmark
async function startTunnelWithBookmark() {
    if (!state.selectedProject || !state.selectedVM) {
        showToast('Please select a project and VM first', 'error');
        return;
    }
    
    if (!state.windowsAppInstalled) {
        showToast('Windows App is not installed', 'error');
        return;
    }
    
    elements.startTunnelBookmarkBtn.disabled = true;
    elements.startTunnelBookmarkBtn.textContent = 'Starting...';
    
    try {
        const tunnel = await window.go.main.App.StartTunnelWithBookmark(
            state.selectedProject.id,
            state.selectedVM.name,
            state.selectedVM.zone,
            0 // Auto-select port
        );
        
        // Add to tunnels list and select it
        state.tunnels.unshift(tunnel);
        state.selectedTunnel = tunnel;
        renderTunnelsList();
        selectTunnel(tunnel.id);
        
        if (tunnel.bookmarkId) {
            showToast(`Tunnel started on port ${tunnel.localPort} with bookmark`, 'success');
        } else {
            showToast(`Tunnel started on port ${tunnel.localPort} (bookmark may have failed)`, 'success');
        }
    } catch (error) {
        showToast('Failed to start tunnel: ' + error.message, 'error');
    } finally {
        elements.startTunnelBookmarkBtn.textContent = 'Start + Bookmark';
        updateButtons();
    }
}

// Stop selected tunnel
async function stopTunnel() {
    if (!state.selectedTunnel) return;
    
    elements.stopTunnelBtn.disabled = true;
    elements.stopTunnelBtn.textContent = 'Stopping...';
    
    try {
        await window.go.main.App.StopTunnel(state.selectedTunnel.id);
        
        // Update tunnel status locally
        state.selectedTunnel.status = 'stopped';
        const tunnelIndex = state.tunnels.findIndex(t => t.id === state.selectedTunnel.id);
        if (tunnelIndex >= 0) {
            state.tunnels[tunnelIndex].status = 'stopped';
        }
        
        renderTunnelsList();
        selectTunnel(state.selectedTunnel.id);
        
        showToast('Tunnel stopped', 'success');
    } catch (error) {
        showToast('Failed to stop tunnel: ' + error.message, 'error');
    } finally {
        elements.stopTunnelBtn.textContent = 'Stop';
        updateButtons();
    }
}

// Remove selected tunnel from list
async function removeTunnel() {
    if (!state.selectedTunnel) return;
    
    try {
        await window.go.main.App.RemoveTunnel(state.selectedTunnel.id);
        
        // Remove from local list
        state.tunnels = state.tunnels.filter(t => t.id !== state.selectedTunnel.id);
        state.selectedTunnel = null;
        
        renderTunnelsList();
        elements.selectedTunnelPanel.style.display = 'none';
        elements.logsContainer.innerHTML = '<div class="log-placeholder">Select a tunnel to view logs...</div>';
        
        showToast('Tunnel removed', 'success');
    } catch (error) {
        showToast('Failed to remove tunnel: ' + error.message, 'error');
    }
    
    updateButtons();
}

// Clear all stopped tunnels
async function clearStoppedTunnels() {
    try {
        const count = await window.go.main.App.ClearStoppedTunnels();
        
        // Reload tunnels
        await loadTunnels();
        
        // Clear selection if it was removed
        if (state.selectedTunnel && !state.tunnels.find(t => t.id === state.selectedTunnel.id)) {
            state.selectedTunnel = null;
            elements.selectedTunnelPanel.style.display = 'none';
            elements.logsContainer.innerHTML = '<div class="log-placeholder">Select a tunnel to view logs...</div>';
        }
        
        if (count > 0) {
            showToast(`Removed ${count} stopped tunnel(s)`, 'success');
        } else {
            showToast('No stopped tunnels to remove', 'info');
        }
    } catch (error) {
        showToast('Failed to clear tunnels: ' + error.message, 'error');
    }
    
    updateButtons();
}

// Stop all running tunnels
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
        
        // Reload tunnels
        await loadTunnels();
        
        // Update selected tunnel if it exists
        if (state.selectedTunnel) {
            const updatedTunnel = state.tunnels.find(t => t.id === state.selectedTunnel.id);
            if (updatedTunnel) {
                state.selectedTunnel = updatedTunnel;
                selectTunnel(state.selectedTunnel.id);
            }
        }
        
        showToast(`Stopped ${count} tunnel(s)`, 'success');
    } catch (error) {
        showToast('Failed to stop tunnels: ' + error.message, 'error');
    } finally {
        elements.stopAllBtn.textContent = 'Stop All';
        updateButtons();
    }
}

// Copy RDP address for selected tunnel
function copyRDPAddress() {
    if (!state.selectedTunnel || state.selectedTunnel.status !== 'running') return;
    
    const address = `localhost:${state.selectedTunnel.localPort}`;
    navigator.clipboard.writeText(address).then(() => {
        showToast(`Copied: ${address}`, 'success');
    }).catch(() => {
        showToast('Failed to copy address', 'error');
    });
}

// Open Windows App
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

// Update logs UI for a tunnel
function updateLogsUI(tunnel) {
    if (!tunnel || !tunnel.logs || tunnel.logs.length === 0) {
        elements.logsContainer.innerHTML = '<div class="log-placeholder">No logs yet...</div>';
        return;
    }
    
    elements.logsContainer.innerHTML = tunnel.logs.map(log => 
        `<div class="log-entry">${escapeHtml(log)}</div>`
    ).join('');
    elements.logsContainer.scrollTop = elements.logsContainer.scrollHeight;
}

// Poll for tunnel status updates
function startStatusPolling() {
    setInterval(async () => {
        // Only poll if we have tunnels
        if (state.tunnels.length === 0) return;
        
        try {
            const tunnels = await window.go.main.App.GetTunnels();
            state.tunnels = tunnels || [];
            
            // Update selected tunnel if it still exists
            if (state.selectedTunnel) {
                const updatedTunnel = state.tunnels.find(t => t.id === state.selectedTunnel.id);
                if (updatedTunnel) {
                    state.selectedTunnel = updatedTunnel;
                    
                    // Update selected tunnel panel
                    elements.tunnelStatus.textContent = updatedTunnel.status;
                    elements.tunnelStatus.className = `tunnel-status-badge ${updatedTunnel.status}`;
                    
                    // Update logs
                    updateLogsUI(updatedTunnel);
                } else {
                    // Tunnel was removed
                    state.selectedTunnel = null;
                    elements.selectedTunnelPanel.style.display = 'none';
                }
            }
            
            renderTunnelsList();
            updateButtons();
        } catch (error) {
            console.error('Failed to poll tunnel status:', error);
        }
    }, 1000);
}

// Setup event listeners
function setupEventListeners() {
    // Auth button
    elements.authBtn.addEventListener('click', runAuthentication);
    
    // Project search with debounce
    let projectSearchTimeout;
    elements.projectSearch.addEventListener('input', (e) => {
        clearTimeout(projectSearchTimeout);
        projectSearchTimeout = setTimeout(() => {
            loadProjects(e.target.value);
        }, 300);
    });
    
    // VM search with debounce
    let vmSearchTimeout;
    elements.vmSearch.addEventListener('input', (e) => {
        if (!state.selectedProject) return;
        clearTimeout(vmSearchTimeout);
        vmSearchTimeout = setTimeout(() => {
            loadVMs(state.selectedProject.id, e.target.value);
        }, 300);
    });
    
    // Favorite button
    elements.toggleFavoriteBtn.addEventListener('click', toggleFavorite);
    
    // Start tunnel buttons
    elements.startTunnelBtn.addEventListener('click', startTunnel);
    elements.startTunnelBookmarkBtn.addEventListener('click', startTunnelWithBookmark);
    elements.openWindowsAppBtn.addEventListener('click', openWindowsApp);
    
    // Selected tunnel actions
    elements.stopTunnelBtn.addEventListener('click', stopTunnel);
    elements.copyAddressBtn.addEventListener('click', copyRDPAddress);
    elements.removeTunnelBtn.addEventListener('click', removeTunnel);
    
    // Tunnel list actions
    elements.stopAllBtn.addEventListener('click', stopAllTunnels);
    elements.clearStoppedBtn.addEventListener('click', clearStoppedTunnels);
    
    // Clear logs
    elements.clearLogsBtn.addEventListener('click', () => {
        elements.logsContainer.innerHTML = '<div class="log-placeholder">Logs cleared...</div>';
    });
}

// Show toast notification
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
