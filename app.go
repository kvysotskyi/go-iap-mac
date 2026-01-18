package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/cedws/iapc/iap"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
	cloudresourcemanager "google.golang.org/api/cloudresourcemanager/v1"
	"google.golang.org/api/compute/v1"
	"google.golang.org/api/option"
)

const (
	// WindowsAppPath is the path to Windows App on macOS
	WindowsAppPath = "/Applications/Windows App.app"
	// WindowsAppCLI is the path to the Windows App CLI executable
	WindowsAppCLI = "/Applications/Windows App.app/Contents/MacOS/Windows App"
	// BookmarkGroup is the group name for IAP tunnel bookmarks
	BookmarkGroup = "IAP Tunnels"
	// AppName is the application name for config directory
	AppName = "IAP Tunnel Manager"
	// ConfigFileName is the name of the config file
	ConfigFileName = "config.json"
)

// App struct
type App struct {
	ctx              context.Context
	tokenSource      oauth2.TokenSource
	tunnels          map[string]*Tunnel
	tunnelsMu        sync.RWMutex
	managedBookmarks map[string]bool // Track bookmark IDs created by this app
	bookmarksMu      sync.RWMutex
	config           *AppConfig
	configMu         sync.RWMutex
	configPath       string
}

// AppConfig represents the persisted application configuration
type AppConfig struct {
	LastConnection *LastConnection `json:"lastConnection,omitempty"`
	Favorites      []Favorite      `json:"favorites"`
}

// LastConnection represents the last used connection settings
type LastConnection struct {
	ProjectID          string `json:"projectId"`
	ProjectName        string `json:"projectName,omitempty"`
	InstanceName       string `json:"instanceName"`
	Zone               string `json:"zone"`
	RemotePort         int    `json:"remotePort"`
	PreferredLocalPort int    `json:"preferredLocalPort,omitempty"`
}

// Favorite represents a saved favorite connection
type Favorite struct {
	ID                 string `json:"id"` // Stable UUID for bookmark mapping
	DisplayName        string `json:"displayName"`
	ProjectID          string `json:"projectId"`
	ProjectName        string `json:"projectName,omitempty"`
	InstanceName       string `json:"instanceName"`
	Zone               string `json:"zone"`
	RemotePort         int    `json:"remotePort"`
	PreferredLocalPort int    `json:"preferredLocalPort,omitempty"`
	CreatedAt          string `json:"createdAt"`
}

// Project represents a GCP project
type Project struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// VM represents a Compute Engine VM instance
type VM struct {
	Name      string `json:"name"`
	Zone      string `json:"zone"`
	Status    string `json:"status"`
	PrivateIP string `json:"privateIp"`
}

// Tunnel represents an active IAP tunnel
type Tunnel struct {
	ID         string    `json:"id"`
	ProjectID  string    `json:"projectId"`
	VMName     string    `json:"vmName"`
	Zone       string    `json:"zone"`
	LocalPort  int       `json:"localPort"`
	RemotePort int       `json:"remotePort"`
	Status     string    `json:"status"`
	StartedAt  time.Time `json:"startedAt"`
	Logs       []string  `json:"logs"`
	BookmarkID string    `json:"bookmarkId,omitempty"`

	listener net.Listener
	cancel   context.CancelFunc
	logsMu   sync.Mutex
}

// TunnelInfo is the JSON-safe tunnel info returned to frontend
type TunnelInfo struct {
	ID         string   `json:"id"`
	ProjectID  string   `json:"projectId"`
	VMName     string   `json:"vmName"`
	Zone       string   `json:"zone"`
	LocalPort  int      `json:"localPort"`
	RemotePort int      `json:"remotePort"`
	Status     string   `json:"status"`
	StartedAt  string   `json:"startedAt"`
	Logs       []string `json:"logs"`
	BookmarkID string   `json:"bookmarkId,omitempty"`
}

// AuthStatus represents the authentication status
type AuthStatus struct {
	Authenticated bool   `json:"authenticated"`
	Error         string `json:"error,omitempty"`
	Email         string `json:"email,omitempty"`
}

// AuthProgress represents progress during authentication
type AuthProgress struct {
	Status  string `json:"status"` // "starting", "running", "success", "error"
	Message string `json:"message"`
}

// GcloudInfo represents information about gcloud installation
type GcloudInfo struct {
	Found   bool   `json:"found"`
	Path    string `json:"path,omitempty"`
	Version string `json:"version,omitempty"`
	Error   string `json:"error,omitempty"`
}

// WindowsAppStatus represents the Windows App availability status
type WindowsAppStatus struct {
	Installed bool   `json:"installed"`
	Path      string `json:"path,omitempty"`
	Error     string `json:"error,omitempty"`
}

// BookmarkResult represents the result of a bookmark operation
type BookmarkResult struct {
	Success    bool   `json:"success"`
	BookmarkID string `json:"bookmarkId,omitempty"`
	Error      string `json:"error,omitempty"`
}

// NewApp creates a new App application struct
func NewApp() *App {
	app := &App{
		tunnels:          make(map[string]*Tunnel),
		managedBookmarks: make(map[string]bool),
		config:           &AppConfig{Favorites: []Favorite{}},
	}
	app.initConfigPath()
	return app
}

// initConfigPath sets up the config file path
func (a *App) initConfigPath() {
	// Get user's Application Support directory
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return
	}
	configDir := filepath.Join(homeDir, "Library", "Application Support", AppName)
	a.configPath = filepath.Join(configDir, ConfigFileName)
}

// getConfigDir returns the config directory path
func (a *App) getConfigDir() string {
	if a.configPath == "" {
		return ""
	}
	return filepath.Dir(a.configPath)
}

// loadConfig loads the configuration from disk
func (a *App) loadConfig() error {
	a.configMu.Lock()
	defer a.configMu.Unlock()

	if a.configPath == "" {
		return fmt.Errorf("config path not set")
	}

	data, err := os.ReadFile(a.configPath)
	if err != nil {
		if os.IsNotExist(err) {
			// No config file yet, use defaults
			a.config = &AppConfig{Favorites: []Favorite{}}
			return nil
		}
		return fmt.Errorf("failed to read config: %w", err)
	}

	var config AppConfig
	if err := json.Unmarshal(data, &config); err != nil {
		return fmt.Errorf("failed to parse config: %w", err)
	}

	// Ensure favorites is not nil
	if config.Favorites == nil {
		config.Favorites = []Favorite{}
	}

	a.config = &config
	return nil
}

// saveConfig saves the configuration to disk
func (a *App) saveConfig() error {
	a.configMu.RLock()
	config := a.config
	a.configMu.RUnlock()

	if a.configPath == "" {
		return fmt.Errorf("config path not set")
	}

	// Ensure config directory exists
	configDir := a.getConfigDir()
	if err := os.MkdirAll(configDir, 0755); err != nil {
		return fmt.Errorf("failed to create config directory: %w", err)
	}

	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal config: %w", err)
	}

	if err := os.WriteFile(a.configPath, data, 0644); err != nil {
		return fmt.Errorf("failed to write config: %w", err)
	}

	return nil
}

// startup is called when the app starts
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	// Load saved configuration
	a.loadConfig()
	// Try to initialize credentials
	a.initCredentials()
}

// shutdown is called when the app is closing
func (a *App) shutdown(ctx context.Context) {
	// Use a timeout for shutdown operations
	shutdownTimeout := 5 * time.Second
	shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()

	// Create a WaitGroup to track tunnel shutdown
	var wg sync.WaitGroup

	// Stop all tunnels
	a.tunnelsMu.Lock()
	for id, t := range a.tunnels {
		if t.Status == "running" || t.Status == "starting" {
			wg.Add(1)
			go func(tunnel *Tunnel, tunnelID string) {
				defer wg.Done()
				a.stopTunnelInternal(tunnel)
			}(t, id)
		}
	}
	a.tunnelsMu.Unlock()

	// Wait for tunnels to stop (with timeout)
	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()

	select {
	case <-done:
		// All tunnels stopped gracefully
	case <-shutdownCtx.Done():
		// Timeout - force close remaining tunnels
		a.tunnelsMu.Lock()
		for _, t := range a.tunnels {
			if t.listener != nil {
				t.listener.Close()
			}
		}
		a.tunnelsMu.Unlock()
	}

	// Delete all managed bookmarks (if Windows App is available)
	a.cleanupManagedBookmarks()
}

// stopTunnelInternal stops a tunnel without locking (caller must handle locking)
func (a *App) stopTunnelInternal(tunnel *Tunnel) {
	if tunnel.cancel != nil {
		tunnel.cancel()
	}
	if tunnel.listener != nil {
		tunnel.listener.Close()
	}
	tunnel.Status = "stopped"
}

// cleanupManagedBookmarks deletes all bookmarks created by this app
func (a *App) cleanupManagedBookmarks() {
	// Check if Windows App is installed
	status := a.CheckWindowsApp()
	if !status.Installed {
		return // Skip bookmark cleanup if Windows App not available
	}

	// Get all managed bookmark IDs
	a.bookmarksMu.RLock()
	bookmarkIDs := make([]string, 0, len(a.managedBookmarks))
	for id := range a.managedBookmarks {
		bookmarkIDs = append(bookmarkIDs, id)
	}
	a.bookmarksMu.RUnlock()

	// Delete each bookmark
	for _, bookmarkID := range bookmarkIDs {
		a.deleteBookmarkQuietly(bookmarkID)
	}
}

// deleteBookmarkQuietly deletes a bookmark without returning errors (for cleanup)
func (a *App) deleteBookmarkQuietly(bookmarkID string) {
	cmd := exec.Command(WindowsAppCLI,
		"--script", "bookmark", "delete", bookmarkID,
	)
	// Run with a short timeout
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	cmd = exec.CommandContext(ctx, WindowsAppCLI,
		"--script", "bookmark", "delete", bookmarkID,
	)
	_ = cmd.Run() // Ignore errors during cleanup
}

// trackBookmark adds a bookmark ID to the managed bookmarks list
func (a *App) trackBookmark(bookmarkID string) {
	a.bookmarksMu.Lock()
	defer a.bookmarksMu.Unlock()
	a.managedBookmarks[bookmarkID] = true
}

// untrackBookmark removes a bookmark ID from the managed bookmarks list
func (a *App) untrackBookmark(bookmarkID string) {
	a.bookmarksMu.Lock()
	defer a.bookmarksMu.Unlock()
	delete(a.managedBookmarks, bookmarkID)
}

// GetManagedBookmarks returns the list of bookmark IDs managed by this app
func (a *App) GetManagedBookmarks() []string {
	a.bookmarksMu.RLock()
	defer a.bookmarksMu.RUnlock()

	bookmarks := make([]string, 0, len(a.managedBookmarks))
	for id := range a.managedBookmarks {
		bookmarks = append(bookmarks, id)
	}
	return bookmarks
}

// GetLastConnection returns the last used connection settings
func (a *App) GetLastConnection() *LastConnection {
	a.configMu.RLock()
	defer a.configMu.RUnlock()

	if a.config == nil || a.config.LastConnection == nil {
		return nil
	}
	// Return a copy
	lc := *a.config.LastConnection
	return &lc
}

// SaveLastConnection saves the last used connection settings
func (a *App) SaveLastConnection(projectID, projectName, instanceName, zone string, remotePort, preferredLocalPort int) error {
	a.configMu.Lock()
	if a.config == nil {
		a.config = &AppConfig{Favorites: []Favorite{}}
	}
	a.config.LastConnection = &LastConnection{
		ProjectID:          projectID,
		ProjectName:        projectName,
		InstanceName:       instanceName,
		Zone:               zone,
		RemotePort:         remotePort,
		PreferredLocalPort: preferredLocalPort,
	}
	a.configMu.Unlock()

	return a.saveConfig()
}

// GetFavorites returns all saved favorites
func (a *App) GetFavorites() []Favorite {
	a.configMu.RLock()
	defer a.configMu.RUnlock()

	if a.config == nil || a.config.Favorites == nil {
		return []Favorite{}
	}

	// Return a copy
	favorites := make([]Favorite, len(a.config.Favorites))
	copy(favorites, a.config.Favorites)
	return favorites
}

// AddFavorite adds a new favorite connection
func (a *App) AddFavorite(displayName, projectID, projectName, instanceName, zone string, remotePort, preferredLocalPort int) (*Favorite, error) {
	a.configMu.Lock()
	defer a.configMu.Unlock()

	if a.config == nil {
		a.config = &AppConfig{Favorites: []Favorite{}}
	}

	// Check if already exists (same project+instance+zone)
	for _, f := range a.config.Favorites {
		if f.ProjectID == projectID && f.InstanceName == instanceName && f.Zone == zone {
			return nil, fmt.Errorf("favorite already exists for this VM")
		}
	}

	// Generate stable ID based on project+instance+zone
	favoriteID := a.GenerateBookmarkID(projectID, instanceName, zone)

	favorite := Favorite{
		ID:                 favoriteID,
		DisplayName:        displayName,
		ProjectID:          projectID,
		ProjectName:        projectName,
		InstanceName:       instanceName,
		Zone:               zone,
		RemotePort:         remotePort,
		PreferredLocalPort: preferredLocalPort,
		CreatedAt:          time.Now().Format(time.RFC3339),
	}

	a.config.Favorites = append(a.config.Favorites, favorite)

	// Save config (unlock first to avoid deadlock)
	a.configMu.Unlock()
	err := a.saveConfig()
	a.configMu.Lock()

	if err != nil {
		// Remove the favorite we just added
		a.config.Favorites = a.config.Favorites[:len(a.config.Favorites)-1]
		return nil, fmt.Errorf("failed to save favorite: %w", err)
	}

	return &favorite, nil
}

// RemoveFavorite removes a favorite by its ID
func (a *App) RemoveFavorite(favoriteID string) error {
	a.configMu.Lock()
	defer a.configMu.Unlock()

	if a.config == nil || a.config.Favorites == nil {
		return fmt.Errorf("favorite not found")
	}

	// Find and remove the favorite
	found := false
	newFavorites := make([]Favorite, 0, len(a.config.Favorites))
	for _, f := range a.config.Favorites {
		if f.ID == favoriteID {
			found = true
			continue
		}
		newFavorites = append(newFavorites, f)
	}

	if !found {
		return fmt.Errorf("favorite not found")
	}

	a.config.Favorites = newFavorites

	// Save config
	a.configMu.Unlock()
	err := a.saveConfig()
	a.configMu.Lock()

	return err
}

// IsFavorite checks if a VM is in favorites
func (a *App) IsFavorite(projectID, instanceName, zone string) bool {
	a.configMu.RLock()
	defer a.configMu.RUnlock()

	if a.config == nil || a.config.Favorites == nil {
		return false
	}

	for _, f := range a.config.Favorites {
		if f.ProjectID == projectID && f.InstanceName == instanceName && f.Zone == zone {
			return true
		}
	}
	return false
}

// GetFavoriteByVM returns a favorite by project+instance+zone
func (a *App) GetFavoriteByVM(projectID, instanceName, zone string) *Favorite {
	a.configMu.RLock()
	defer a.configMu.RUnlock()

	if a.config == nil || a.config.Favorites == nil {
		return nil
	}

	for _, f := range a.config.Favorites {
		if f.ProjectID == projectID && f.InstanceName == instanceName && f.Zone == zone {
			fav := f // Copy
			return &fav
		}
	}
	return nil
}

// UpdateFavorite updates an existing favorite
func (a *App) UpdateFavorite(favoriteID, displayName string, remotePort, preferredLocalPort int) error {
	a.configMu.Lock()
	defer a.configMu.Unlock()

	if a.config == nil || a.config.Favorites == nil {
		return fmt.Errorf("favorite not found")
	}

	found := false
	for i := range a.config.Favorites {
		if a.config.Favorites[i].ID == favoriteID {
			if displayName != "" {
				a.config.Favorites[i].DisplayName = displayName
			}
			if remotePort > 0 {
				a.config.Favorites[i].RemotePort = remotePort
			}
			a.config.Favorites[i].PreferredLocalPort = preferredLocalPort
			found = true
			break
		}
	}

	if !found {
		return fmt.Errorf("favorite not found")
	}

	// Save config
	a.configMu.Unlock()
	err := a.saveConfig()
	a.configMu.Lock()

	return err
}

// initCredentials initializes Google Cloud credentials using ADC
func (a *App) initCredentials() error {
	ctx := context.Background()
	tokenSource, err := google.DefaultTokenSource(ctx,
		"https://www.googleapis.com/auth/cloud-platform",
		"https://www.googleapis.com/auth/compute.readonly",
	)
	if err != nil {
		return fmt.Errorf("failed to get default credentials: %w", err)
	}
	a.tokenSource = tokenSource
	return nil
}

// CheckAuth checks if the user is authenticated
func (a *App) CheckAuth() AuthStatus {
	if a.tokenSource == nil {
		if err := a.initCredentials(); err != nil {
			return AuthStatus{
				Authenticated: false,
				Error:         "Application Default Credentials not found. Please run 'gcloud auth application-default login' to authenticate.",
			}
		}
	}

	// Try to get a token to verify credentials work
	token, err := a.tokenSource.Token()
	if err != nil {
		return AuthStatus{
			Authenticated: false,
			Error:         fmt.Sprintf("Failed to get token: %v. Please run 'gcloud auth application-default login'", err),
		}
	}

	if !token.Valid() {
		return AuthStatus{
			Authenticated: false,
			Error:         "Token is invalid or expired. Please run 'gcloud auth application-default login'",
		}
	}

	return AuthStatus{
		Authenticated: true,
	}
}

// FindGcloud finds the gcloud CLI path
func (a *App) FindGcloud() GcloudInfo {
	// Common paths to check for gcloud
	paths := []string{
		"/usr/local/bin/gcloud",
		"/opt/homebrew/bin/gcloud",
		"/usr/bin/gcloud",
		"/snap/bin/gcloud",
	}

	// Also check user's home directory for Google Cloud SDK
	if homeDir, err := os.UserHomeDir(); err == nil {
		paths = append(paths,
			filepath.Join(homeDir, "google-cloud-sdk", "bin", "gcloud"),
			filepath.Join(homeDir, ".local", "bin", "gcloud"),
		)
	}

	// Try to find gcloud in PATH first
	if gcloudPath, err := exec.LookPath("gcloud"); err == nil {
		return a.verifyGcloud(gcloudPath)
	}

	// Check common paths
	for _, path := range paths {
		if _, err := os.Stat(path); err == nil {
			return a.verifyGcloud(path)
		}
	}

	return GcloudInfo{
		Found: false,
		Error: "gcloud CLI not found. Please install Google Cloud SDK from https://cloud.google.com/sdk/docs/install",
	}
}

// verifyGcloud verifies gcloud works and gets version
func (a *App) verifyGcloud(path string) GcloudInfo {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, path, "version", "--format=value(version)")
	output, err := cmd.Output()
	if err != nil {
		return GcloudInfo{
			Found: true,
			Path:  path,
			Error: fmt.Sprintf("gcloud found but failed to get version: %v", err),
		}
	}

	version := strings.TrimSpace(string(output))
	return GcloudInfo{
		Found:   true,
		Path:    path,
		Version: version,
	}
}

// RunADCLogin runs gcloud auth application-default login
func (a *App) RunADCLogin() AuthProgress {
	// Find gcloud first
	gcloudInfo := a.FindGcloud()
	if !gcloudInfo.Found {
		return AuthProgress{
			Status:  "error",
			Message: gcloudInfo.Error,
		}
	}

	// Run the auth command
	// Note: This command opens a browser for OAuth flow
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	cmd := exec.CommandContext(ctx, gcloudInfo.Path, "auth", "application-default", "login")

	// Capture output
	output, err := cmd.CombinedOutput()
	outputStr := string(output)

	if err != nil {
		// Check if it was cancelled/timeout
		if ctx.Err() == context.DeadlineExceeded {
			return AuthProgress{
				Status:  "error",
				Message: "Authentication timed out after 5 minutes",
			}
		}
		return AuthProgress{
			Status:  "error",
			Message: fmt.Sprintf("Authentication failed: %v\n%s", err, outputStr),
		}
	}

	// Clear existing token source to force re-initialization
	a.tokenSource = nil

	// Re-initialize credentials
	if err := a.initCredentials(); err != nil {
		return AuthProgress{
			Status:  "error",
			Message: fmt.Sprintf("Credentials saved but failed to load: %v", err),
		}
	}

	// Verify the new credentials work
	authStatus := a.CheckAuth()
	if !authStatus.Authenticated {
		return AuthProgress{
			Status:  "error",
			Message: fmt.Sprintf("Authentication completed but verification failed: %s", authStatus.Error),
		}
	}

	return AuthProgress{
		Status:  "success",
		Message: "Successfully authenticated with Google Cloud",
	}
}

// RefreshAuth clears cached credentials and re-checks authentication
func (a *App) RefreshAuth() AuthStatus {
	// Clear existing token source
	a.tokenSource = nil

	// Re-initialize and check
	return a.CheckAuth()
}

// ListProjects returns all accessible GCP projects
func (a *App) ListProjects(filter string) ([]Project, error) {
	if a.tokenSource == nil {
		return nil, fmt.Errorf("not authenticated")
	}

	ctx := context.Background()
	crmService, err := cloudresourcemanager.NewService(ctx, option.WithTokenSource(a.tokenSource))
	if err != nil {
		return nil, fmt.Errorf("failed to create resource manager client: %w", err)
	}

	var projects []Project
	filter = strings.ToLower(filter)

	err = crmService.Projects.List().Pages(ctx, func(page *cloudresourcemanager.ListProjectsResponse) error {
		for _, p := range page.Projects {
			// Only include active projects
			if p.LifecycleState != "ACTIVE" {
				continue
			}
			// Apply filter if provided
			if filter != "" {
				if !strings.Contains(strings.ToLower(p.ProjectId), filter) &&
					!strings.Contains(strings.ToLower(p.Name), filter) {
					continue
				}
			}
			projects = append(projects, Project{
				ID:   p.ProjectId,
				Name: p.Name,
			})
		}
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list projects: %w", err)
	}

	// Sort by name
	sort.Slice(projects, func(i, j int) bool {
		return projects[i].Name < projects[j].Name
	})

	return projects, nil
}

// ListVMs returns all VMs for a given project
func (a *App) ListVMs(projectID, filter string) ([]VM, error) {
	if a.tokenSource == nil {
		return nil, fmt.Errorf("not authenticated")
	}

	ctx := context.Background()
	computeService, err := compute.NewService(ctx, option.WithTokenSource(a.tokenSource))
	if err != nil {
		return nil, fmt.Errorf("failed to create compute client: %w", err)
	}

	var vms []VM
	filter = strings.ToLower(filter)

	// Use aggregated list to get VMs across all zones
	err = computeService.Instances.AggregatedList(projectID).Pages(ctx, func(page *compute.InstanceAggregatedList) error {
		for zonePath, instanceList := range page.Items {
			if instanceList.Instances == nil {
				continue
			}
			// Extract zone name from path (e.g., "zones/us-central1-a" -> "us-central1-a")
			zone := zonePath
			if strings.HasPrefix(zonePath, "zones/") {
				zone = strings.TrimPrefix(zonePath, "zones/")
			}

			for _, instance := range instanceList.Instances {
				// Apply filter if provided
				if filter != "" {
					if !strings.Contains(strings.ToLower(instance.Name), filter) &&
						!strings.Contains(strings.ToLower(zone), filter) {
						continue
					}
				}

				// Get private IP
				var privateIP string
				if len(instance.NetworkInterfaces) > 0 {
					privateIP = instance.NetworkInterfaces[0].NetworkIP
				}

				vms = append(vms, VM{
					Name:      instance.Name,
					Zone:      zone,
					Status:    instance.Status,
					PrivateIP: privateIP,
				})
			}
		}
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list VMs: %w", err)
	}

	// Sort by name
	sort.Slice(vms, func(i, j int) bool {
		return vms[i].Name < vms[j].Name
	})

	return vms, nil
}

// GetFreePort finds an available local port that is not used by any active tunnel
func (a *App) GetFreePort() (int, error) {
	// Try up to 10 times to find a port not used by our tunnels
	for attempts := 0; attempts < 10; attempts++ {
		listener, err := net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			return 0, err
		}
		port := listener.Addr().(*net.TCPAddr).Port
		listener.Close()

		// Check if this port is already used by one of our tunnels
		if !a.isPortInUse(port) {
			return port, nil
		}
	}
	return 0, fmt.Errorf("failed to find free port after multiple attempts")
}

// isPortInUse checks if a port is currently used by an active tunnel
func (a *App) isPortInUse(port int) bool {
	a.tunnelsMu.RLock()
	defer a.tunnelsMu.RUnlock()

	for _, t := range a.tunnels {
		if t.LocalPort == port && (t.Status == "running" || t.Status == "starting") {
			return true
		}
	}
	return false
}

// GetUsedPorts returns a list of ports currently used by active tunnels
func (a *App) GetUsedPorts() []int {
	a.tunnelsMu.RLock()
	defer a.tunnelsMu.RUnlock()

	var ports []int
	for _, t := range a.tunnels {
		if t.Status == "running" || t.Status == "starting" {
			ports = append(ports, t.LocalPort)
		}
	}
	return ports
}

// StartTunnel starts an IAP tunnel to the specified VM
func (a *App) StartTunnel(projectID, vmName, zone string, localPort int) (*TunnelInfo, error) {
	return a.StartTunnelWithRemotePort(projectID, vmName, zone, localPort, 3389)
}

// StartTunnelWithRemotePort starts an IAP tunnel to the specified VM with a custom remote port
func (a *App) StartTunnelWithRemotePort(projectID, vmName, zone string, localPort, remotePort int) (*TunnelInfo, error) {
	if a.tokenSource == nil {
		return nil, fmt.Errorf("not authenticated")
	}

	// Generate unique tunnel ID using timestamp to allow multiple tunnels to same VM
	tunnelID := fmt.Sprintf("%s-%s-%s-%d", projectID, vmName, zone, time.Now().UnixNano())

	// If localPort is 0, find a free port
	if localPort == 0 {
		var err error
		localPort, err = a.GetFreePort()
		if err != nil {
			return nil, fmt.Errorf("failed to find free port: %w", err)
		}
	} else {
		// Check if the specified port is already used by another tunnel
		if a.isPortInUse(localPort) {
			// Try to find a free port instead
			freePort, err := a.GetFreePort()
			if err != nil {
				return nil, fmt.Errorf("port %d is in use by another tunnel, and failed to find alternative: %w", localPort, err)
			}
			return nil, fmt.Errorf("port %d is in use by another tunnel. Suggested alternative: %d", localPort, freePort)
		}
	}

	// Check if port is available on the system
	testListener, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", localPort))
	if err != nil {
		return nil, fmt.Errorf("port %d is not available: %w", localPort, err)
	}
	testListener.Close()

	// Create tunnel context
	ctx, cancel := context.WithCancel(context.Background())

	tunnel := &Tunnel{
		ID:         tunnelID,
		ProjectID:  projectID,
		VMName:     vmName,
		Zone:       zone,
		LocalPort:  localPort,
		RemotePort: remotePort,
		Status:     "starting",
		StartedAt:  time.Now(),
		Logs:       []string{},
		cancel:     cancel,
	}

	// Store tunnel
	a.tunnelsMu.Lock()
	a.tunnels[tunnelID] = tunnel
	a.tunnelsMu.Unlock()

	// Start the tunnel in a goroutine
	go a.runTunnel(ctx, tunnel)

	return tunnel.toInfo(), nil
}

// runTunnel runs the IAP tunnel
func (a *App) runTunnel(ctx context.Context, tunnel *Tunnel) {
	tunnel.addLog(fmt.Sprintf("Starting tunnel to %s in zone %s (remote port %d)", tunnel.VMName, tunnel.Zone, tunnel.RemotePort))

	// Create local listener
	listener, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", tunnel.LocalPort))
	if err != nil {
		tunnel.Status = "error"
		tunnel.addLog(fmt.Sprintf("Failed to create listener: %v", err))
		return
	}
	tunnel.listener = listener
	tunnel.Status = "running"
	tunnel.addLog(fmt.Sprintf("Listening on 127.0.0.1:%d -> remote:%d", tunnel.LocalPort, tunnel.RemotePort))

	// Accept connections
	go func() {
		for {
			conn, err := listener.Accept()
			if err != nil {
				select {
				case <-ctx.Done():
					return
				default:
					tunnel.addLog(fmt.Sprintf("Accept error: %v", err))
					continue
				}
			}
			tunnel.addLog(fmt.Sprintf("New connection from %s", conn.RemoteAddr()))
			go a.handleConnection(ctx, tunnel, conn)
		}
	}()

	// Wait for context cancellation
	<-ctx.Done()
	tunnel.Status = "stopped"
	tunnel.addLog("Tunnel stopped")
	listener.Close()
}

// handleConnection handles a single connection through the IAP tunnel
func (a *App) handleConnection(ctx context.Context, tunnel *Tunnel, localConn net.Conn) {
	defer localConn.Close()

	// Dial IAP tunnel
	opts := []iap.DialOption{
		iap.WithProject(tunnel.ProjectID),
		iap.WithInstance(tunnel.VMName, tunnel.Zone, "nic0"),
		iap.WithPort(fmt.Sprintf("%d", tunnel.RemotePort)),
		iap.WithTokenSource(&a.tokenSource),
	}

	iapConn, err := iap.Dial(ctx, opts...)
	if err != nil {
		tunnel.addLog(fmt.Sprintf("Failed to dial IAP: %v", err))
		return
	}
	defer iapConn.Close()

	tunnel.addLog("IAP connection established")

	// Bidirectional copy
	var wg sync.WaitGroup
	wg.Add(2)

	// Local -> IAP
	go func() {
		defer wg.Done()
		io.Copy(iapConn, localConn)
	}()

	// IAP -> Local
	go func() {
		defer wg.Done()
		io.Copy(localConn, iapConn)
	}()

	wg.Wait()
	tunnel.addLog("Connection closed")
}

// StopTunnel stops an active tunnel
func (a *App) StopTunnel(tunnelID string) error {
	a.tunnelsMu.Lock()
	defer a.tunnelsMu.Unlock()

	tunnel, ok := a.tunnels[tunnelID]
	if !ok {
		return fmt.Errorf("tunnel not found")
	}

	if tunnel.cancel != nil {
		tunnel.cancel()
	}
	if tunnel.listener != nil {
		tunnel.listener.Close()
	}

	tunnel.Status = "stopped"
	return nil
}

// GetTunnels returns all tunnels sorted by start time (newest first)
func (a *App) GetTunnels() []TunnelInfo {
	a.tunnelsMu.RLock()
	defer a.tunnelsMu.RUnlock()

	var tunnels []TunnelInfo
	for _, t := range a.tunnels {
		tunnels = append(tunnels, *t.toInfo())
	}

	// Sort by start time (newest first)
	sort.Slice(tunnels, func(i, j int) bool {
		return tunnels[i].StartedAt > tunnels[j].StartedAt
	})

	return tunnels
}

// GetActiveTunnels returns only running or starting tunnels
func (a *App) GetActiveTunnels() []TunnelInfo {
	a.tunnelsMu.RLock()
	defer a.tunnelsMu.RUnlock()

	var tunnels []TunnelInfo
	for _, t := range a.tunnels {
		if t.Status == "running" || t.Status == "starting" {
			tunnels = append(tunnels, *t.toInfo())
		}
	}

	// Sort by start time (newest first)
	sort.Slice(tunnels, func(i, j int) bool {
		return tunnels[i].StartedAt > tunnels[j].StartedAt
	})

	return tunnels
}

// RemoveTunnel removes a stopped tunnel from the list
func (a *App) RemoveTunnel(tunnelID string) error {
	a.tunnelsMu.Lock()
	defer a.tunnelsMu.Unlock()

	tunnel, ok := a.tunnels[tunnelID]
	if !ok {
		return fmt.Errorf("tunnel not found")
	}

	// Only allow removing stopped or error tunnels
	if tunnel.Status == "running" || tunnel.Status == "starting" {
		return fmt.Errorf("cannot remove active tunnel, stop it first")
	}

	delete(a.tunnels, tunnelID)
	return nil
}

// ClearStoppedTunnels removes all stopped tunnels from the list
func (a *App) ClearStoppedTunnels() int {
	a.tunnelsMu.Lock()
	defer a.tunnelsMu.Unlock()

	count := 0
	for id, t := range a.tunnels {
		if t.Status == "stopped" || t.Status == "error" {
			delete(a.tunnels, id)
			count++
		}
	}
	return count
}

// GetTunnel returns a specific tunnel
func (a *App) GetTunnel(tunnelID string) (*TunnelInfo, error) {
	a.tunnelsMu.RLock()
	defer a.tunnelsMu.RUnlock()

	tunnel, ok := a.tunnels[tunnelID]
	if !ok {
		return nil, fmt.Errorf("tunnel not found")
	}
	return tunnel.toInfo(), nil
}

// CheckWindowsApp checks if Windows App is installed on macOS
func (a *App) CheckWindowsApp() WindowsAppStatus {
	_, err := os.Stat(WindowsAppPath)
	if os.IsNotExist(err) {
		return WindowsAppStatus{
			Installed: false,
			Error:     "Windows App not found. Install it from the Mac App Store to enable RDP bookmark integration.",
		}
	}
	if err != nil {
		return WindowsAppStatus{
			Installed: false,
			Error:     fmt.Sprintf("Error checking Windows App: %v", err),
		}
	}

	// Also verify the CLI is accessible
	_, err = os.Stat(WindowsAppCLI)
	if err != nil {
		return WindowsAppStatus{
			Installed: false,
			Error:     "Windows App found but CLI not accessible",
		}
	}

	return WindowsAppStatus{
		Installed: true,
		Path:      WindowsAppPath,
	}
}

// GenerateBookmarkID generates a stable bookmark ID for a VM connection
// Uses a hash of project+vm+zone to ensure the same VM always gets the same bookmark ID
func (a *App) GenerateBookmarkID(projectID, vmName, zone string) string {
	// Create a deterministic ID based on the connection parameters
	data := fmt.Sprintf("%s:%s:%s", projectID, vmName, zone)
	hash := sha256.Sum256([]byte(data))
	// Use first 8 bytes (16 hex chars) for a shorter but still unique ID
	// Convert to numeric string for Windows App compatibility
	hashHex := hex.EncodeToString(hash[:8])
	// Convert hex to a numeric ID (Windows App expects numeric IDs)
	// Take first 7 digits to stay within reasonable bounds
	numericID := ""
	for i := 0; i < len(hashHex) && len(numericID) < 7; i++ {
		c := hashHex[i]
		if c >= '0' && c <= '9' {
			numericID += string(c)
		} else {
			// Convert a-f to 0-5
			numericID += string('0' + (c - 'a'))
		}
	}
	// Ensure we have at least 7 digits
	for len(numericID) < 7 {
		numericID += "0"
	}
	return numericID
}

// CreateWindowsAppBookmark creates or updates a Windows App bookmark for the tunnel
func (a *App) CreateWindowsAppBookmark(projectID, vmName, zone string, localPort int) BookmarkResult {
	// Check if Windows App is installed
	status := a.CheckWindowsApp()
	if !status.Installed {
		return BookmarkResult{
			Success: false,
			Error:   status.Error,
		}
	}

	// Generate stable bookmark ID
	bookmarkID := a.GenerateBookmarkID(projectID, vmName, zone)

	// Build the friendly name with IAP prefix for identification
	friendlyName := fmt.Sprintf("IAP: %s (%s)", vmName, zone)

	// Build the hostname (localhost with port)
	hostname := fmt.Sprintf("localhost:%d", localPort)

	// Execute Windows App CLI to create/update bookmark
	cmd := exec.Command(WindowsAppCLI,
		"--script", "bookmark", "write", bookmarkID,
		"--hostname", hostname,
		"--friendlyname", friendlyName,
		"--group", BookmarkGroup,
		"--fullscreen", "false",
		"--autoreconnect", "true",
	)

	output, err := cmd.CombinedOutput()
	if err != nil {
		return BookmarkResult{
			Success:    false,
			BookmarkID: bookmarkID,
			Error:      fmt.Sprintf("Failed to create bookmark: %v - %s", err, string(output)),
		}
	}

	// Track this bookmark so we can clean it up on exit
	a.trackBookmark(bookmarkID)

	return BookmarkResult{
		Success:    true,
		BookmarkID: bookmarkID,
	}
}

// DeleteWindowsAppBookmark deletes a Windows App bookmark
func (a *App) DeleteWindowsAppBookmark(bookmarkID string) BookmarkResult {
	// Check if Windows App is installed
	status := a.CheckWindowsApp()
	if !status.Installed {
		return BookmarkResult{
			Success: false,
			Error:   status.Error,
		}
	}

	// Execute Windows App CLI to delete bookmark
	cmd := exec.Command(WindowsAppCLI,
		"--script", "bookmark", "delete", bookmarkID,
	)

	output, err := cmd.CombinedOutput()
	if err != nil {
		return BookmarkResult{
			Success:    false,
			BookmarkID: bookmarkID,
			Error:      fmt.Sprintf("Failed to delete bookmark: %v - %s", err, string(output)),
		}
	}

	// Remove from tracked bookmarks
	a.untrackBookmark(bookmarkID)

	return BookmarkResult{
		Success:    true,
		BookmarkID: bookmarkID,
	}
}

// StartTunnelWithBookmark starts an IAP tunnel and creates a Windows App bookmark
func (a *App) StartTunnelWithBookmark(projectID, vmName, zone string, localPort int) (*TunnelInfo, error) {
	// First start the tunnel
	tunnelInfo, err := a.StartTunnel(projectID, vmName, zone, localPort)
	if err != nil {
		return nil, err
	}

	// Wait a moment for the tunnel to be ready
	time.Sleep(100 * time.Millisecond)

	// Create the bookmark
	bookmarkResult := a.CreateWindowsAppBookmark(projectID, vmName, zone, tunnelInfo.LocalPort)

	// Update tunnel with bookmark ID
	a.tunnelsMu.Lock()
	if tunnel, ok := a.tunnels[tunnelInfo.ID]; ok {
		tunnel.BookmarkID = bookmarkResult.BookmarkID
		if bookmarkResult.Success {
			tunnel.addLog(fmt.Sprintf("Windows App bookmark created (ID: %s)", bookmarkResult.BookmarkID))
		} else {
			tunnel.addLog(fmt.Sprintf("Warning: Failed to create bookmark: %s", bookmarkResult.Error))
		}
	}
	a.tunnelsMu.Unlock()

	// Get updated tunnel info
	return a.GetTunnel(tunnelInfo.ID)
}

// OpenWindowsApp opens the Windows App application
func (a *App) OpenWindowsApp() error {
	status := a.CheckWindowsApp()
	if !status.Installed {
		return fmt.Errorf(status.Error)
	}

	cmd := exec.Command("open", "-a", "Windows App")
	return cmd.Run()
}

// UpdateBookmarkPort updates an existing bookmark with a new port
func (a *App) UpdateBookmarkPort(bookmarkID string, projectID, vmName, zone string, localPort int) BookmarkResult {
	// Simply create/update the bookmark with the new port
	return a.CreateWindowsAppBookmark(projectID, vmName, zone, localPort)
}

// StopAllTunnels stops all running tunnels
func (a *App) StopAllTunnels() int {
	a.tunnelsMu.Lock()
	defer a.tunnelsMu.Unlock()

	count := 0
	for _, t := range a.tunnels {
		if t.Status == "running" || t.Status == "starting" {
			a.stopTunnelInternal(t)
			count++
		}
	}
	return count
}

// CleanupAllBookmarks deletes all bookmarks managed by this app
func (a *App) CleanupAllBookmarks() int {
	// Check if Windows App is installed
	status := a.CheckWindowsApp()
	if !status.Installed {
		return 0
	}

	// Get all managed bookmark IDs
	a.bookmarksMu.Lock()
	bookmarkIDs := make([]string, 0, len(a.managedBookmarks))
	for id := range a.managedBookmarks {
		bookmarkIDs = append(bookmarkIDs, id)
	}
	a.bookmarksMu.Unlock()

	// Delete each bookmark
	count := 0
	for _, bookmarkID := range bookmarkIDs {
		result := a.DeleteWindowsAppBookmark(bookmarkID)
		if result.Success {
			count++
		}
	}
	return count
}

// StopTunnelAndDeleteBookmark stops a tunnel and deletes its associated bookmark
func (a *App) StopTunnelAndDeleteBookmark(tunnelID string) error {
	a.tunnelsMu.Lock()
	tunnel, ok := a.tunnels[tunnelID]
	if !ok {
		a.tunnelsMu.Unlock()
		return fmt.Errorf("tunnel not found")
	}

	// Get bookmark ID before stopping
	bookmarkID := tunnel.BookmarkID

	// Stop the tunnel
	a.stopTunnelInternal(tunnel)
	a.tunnelsMu.Unlock()

	// Delete the bookmark if it exists
	if bookmarkID != "" {
		a.DeleteWindowsAppBookmark(bookmarkID)
	}

	return nil
}

// Helper methods

func (t *Tunnel) addLog(msg string) {
	t.logsMu.Lock()
	defer t.logsMu.Unlock()
	timestamp := time.Now().Format("15:04:05")
	t.Logs = append(t.Logs, fmt.Sprintf("[%s] %s", timestamp, msg))
	// Keep only last 100 logs
	if len(t.Logs) > 100 {
		t.Logs = t.Logs[len(t.Logs)-100:]
	}
}

func (t *Tunnel) toInfo() *TunnelInfo {
	t.logsMu.Lock()
	defer t.logsMu.Unlock()
	logs := make([]string, len(t.Logs))
	copy(logs, t.Logs)
	return &TunnelInfo{
		ID:         t.ID,
		ProjectID:  t.ProjectID,
		VMName:     t.VMName,
		Zone:       t.Zone,
		LocalPort:  t.LocalPort,
		RemotePort: t.RemotePort,
		Status:     t.Status,
		StartedAt:  t.StartedAt.Format(time.RFC3339),
		Logs:       logs,
		BookmarkID: t.BookmarkID,
	}
}
