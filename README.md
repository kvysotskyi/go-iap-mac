# IAP Tunnel Manager

A macOS desktop application for creating IAP (Identity-Aware Proxy) RDP tunnels to Google Cloud Platform VM instances.

## Features

- **Single Window UI**: Clean, modern interface with project and VM selection
- **Live Search**: Filter projects and VMs as you type
- **IAP TCP Tunneling**: Create tunnels to VMs without external IPs
- **Auto Port Selection**: Automatically finds free local ports
- **Tunnel Management**: Start, stop, and monitor tunnel status
- **Copy RDP Address**: Quick copy of `localhost:<port>` for RDP clients
- **Real-time Logs**: View tunnel connection logs
- **Windows App Integration**: Automatically create RDP bookmarks in Microsoft Windows App (formerly Microsoft Remote Desktop)

## Prerequisites

### 1. Google Cloud Authentication

This app uses Application Default Credentials (ADC). Before running, authenticate with:

```bash
gcloud auth application-default login
```

### 2. Required IAM Permissions

Your Google account needs the following permissions:

- **Project Viewer** (`roles/viewer`) - to list projects
- **Compute Viewer** (`roles/compute.viewer`) - to list VMs
- **IAP-secured Tunnel User** (`roles/iap.tunnelResourceAccessor`) - to create tunnels

### 3. Firewall Rules

Ensure your VPC has a firewall rule allowing IAP traffic:

- **Source IP range**: `35.235.240.0/20`
- **Target**: VMs you want to connect to
- **Ports**: `3389` (RDP)

### 4. Development Requirements

- Go 1.21+
- Node.js 18+
- Wails CLI v2

## Installation

### Install Wails CLI

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@latest
```

### Build the Application

```bash
# Install frontend dependencies
cd frontend && npm install && cd ..

# Download Go dependencies
go mod tidy

# Build for macOS
wails build -platform darwin/universal
```

The built application will be in `build/bin/`.

## Development

### Run in Development Mode

```bash
wails dev
```

This starts the app with hot-reload for frontend changes.

### Project Structure

```
go-iap/
├── main.go              # Wails app entry point
├── app.go               # Go backend (GCP APIs, tunnel management)
├── wails.json           # Wails configuration
├── go.mod               # Go dependencies
├── frontend/
│   ├── index.html       # Main HTML
│   ├── package.json     # Frontend dependencies
│   ├── vite.config.js   # Vite configuration
│   └── src/
│       ├── main.js      # Frontend JavaScript
│       └── style.css    # Styles
└── README.md
```

## Usage

1. **Launch the app** - It will check for valid GCP credentials
2. **Select a project** - Use the search box to filter projects
3. **Select a VM** - Choose the VM you want to connect to
4. **Start Tunnel** - Click "Start Tunnel" to create the IAP connection
5. **Connect via RDP** - Use the "Copy RDP Address" button and paste into your RDP client

### Windows App Integration

If you have [Microsoft Windows App](https://apps.apple.com/app/windows-app/id1295203466) installed:

1. Click **"Start + Bookmark"** instead of "Start Tunnel"
2. This creates/updates a bookmark in Windows App pointing to `localhost:<port>`
3. Click **"Open Windows App"** to launch the RDP client
4. Your bookmark will appear in the "IAP Tunnels" group

The bookmark uses a stable ID based on the VM, so reconnecting to the same VM updates the existing bookmark rather than creating duplicates.

## Troubleshooting

### "Application Default Credentials not found"

Run `gcloud auth application-default login` and restart the app.

### "Permission denied" when listing projects

Ensure your account has the `roles/viewer` role at the organization or folder level.

### "Failed to dial IAP"

Check that:
- The VM is running
- You have `roles/iap.tunnelResourceAccessor` permission
- The firewall allows IAP traffic (35.235.240.0/20)

### Tunnel starts but RDP fails

- Verify the VM has RDP enabled (Windows) or xrdp installed (Linux)
- Check that port 3389 is listening on the VM

## Technical Details

### IAP Tunnel Implementation

This app uses the [cedws/iapc](https://github.com/cedws/iapc) library which implements the Google IAP SSH Relay v4 protocol. The tunnel:

1. Listens on a local port (127.0.0.1)
2. For each incoming connection, establishes an IAP WebSocket tunnel
3. Proxies data bidirectionally between local and remote endpoints

### API Usage

- **Resource Manager API**: List accessible GCP projects
- **Compute Engine API**: List VM instances (aggregated across all zones)
- **IAP TCP Forwarding**: WebSocket-based tunnel protocol

## License

MIT License
