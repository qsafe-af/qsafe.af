# WebSocket Troubleshooting Guide

This guide helps diagnose and resolve WebSocket connection issues in the blockchain explorer.

## Common WebSocket Errors

### 1. "WebSocket connection failed"

**Symptoms:**
- Error message appears immediately after navigating to block detail page
- Connection status shows "error" or "disconnected"
- No block data is displayed

**Possible Causes:**
1. **Invalid endpoint URL**
   - Check if the chain has a valid endpoint configured in `chains.ts`
   - Verify the WebSocket URL format (should start with `wss://` or `ws://`)

2. **Network connectivity issues**
   - Firewall blocking WebSocket connections
   - Corporate proxy blocking WebSocket protocol
   - VPN interference

3. **SSL/TLS certificate issues**
   - Self-signed certificates not trusted by browser
   - Expired certificates
   - Certificate hostname mismatch

4. **Server-side issues**
   - WebSocket server is down
   - Server rejecting connections (rate limiting)
   - Server not supporting the requested protocols

### 2. "Block not found" errors

**Symptoms:**
- Connection succeeds but block query returns null
- Error: "Block #XXXXX not found"

**Possible Causes:**
1. Block number doesn't exist yet (too high)
2. Block has been pruned from the node
3. Node is still syncing and doesn't have the block

### 3. "RPC Error" messages

**Symptoms:**
- Connection succeeds but RPC calls fail
- Error messages with specific RPC error codes

**Common RPC Errors:**
- **Method not found**: The node doesn't support the RPC method
- **Invalid params**: Wrong parameter format or count
- **Internal error**: Server-side processing error

## Debugging Steps

### 1. Check Browser Console

Open browser developer tools (F12) and look for:
```
Connecting to Resonance at wss://a.t.res.fm for block 115241 (attempt 1)
WebSocket connected successfully
Requesting block hash for number: 115241
```

Error indicators:
```
WebSocket error: Event {...}
WebSocket closed: 1006
```

### 2. Verify Chain Configuration

Check `chains.ts` to ensure the chain has endpoints:
```typescript
resonance: {
  name: "resonance",
  genesis: "0xdbacc01ae41b79388135ccd5d0ebe81eb0905260344256e6f4003bb8e75a91b5",
  displayName: "Resonance",
  endpoints: ["wss://a.t.res.fm"],  // Must have at least one endpoint
}
```

### 3. Test WebSocket Connection

Use browser console to test connection:
```javascript
const ws = new WebSocket('wss://a.t.res.fm');
ws.onopen = () => console.log('Connected!');
ws.onerror = (e) => console.error('Error:', e);
ws.onclose = (e) => console.log('Closed:', e.code, e.reason);
```

### 4. Test RPC Methods

Once connected, test RPC calls:
```javascript
ws.send(JSON.stringify({
  id: 1,
  jsonrpc: "2.0",
  method: "chain_getBlockHash",
  params: [115241]
}));
```

## Solutions

### For Connection Issues

1. **Try different network**
   - Switch from corporate/VPN to home network
   - Use mobile hotspot to rule out network restrictions

2. **Check browser settings**
   - Disable browser extensions that might interfere
   - Try incognito/private mode
   - Try different browser

3. **Verify endpoint status**
   - Check if endpoint is publicly accessible
   - Contact chain operators if endpoint is down

### For Block Query Issues

1. **Try recent block**
   - Use a lower block number
   - Try the latest block: navigate to activity page first

2. **Use block hash instead**
   - Get hash from activity page
   - Navigate using hash: `/chains/resonance/block/0x...`

### For SSL/Certificate Issues

1. **For development**
   - Use `ws://` instead of `wss://` if testing locally
   - Accept self-signed certificates in browser

2. **For production**
   - Ensure valid SSL certificate
   - Check certificate expiration
   - Verify certificate matches domain

## Error Recovery Features

The BlockDetail component includes several recovery mechanisms:

1. **Automatic Retry**
   - Attempts reconnection up to 3 times
   - 2-second delay between attempts

2. **Manual Retry**
   - Click "Retry" button in error message
   - Forces new connection attempt

3. **Detailed Error Info**
   - Shows block number/hash attempted
   - Displays chain name and endpoint
   - Includes connection attempt count

## Prevention

1. **Multiple Endpoints**
   - Configure backup endpoints in chains.ts
   - Implement endpoint rotation on failure

2. **Connection Pooling**
   - Reuse WebSocket connections across components
   - Implement connection state management

3. **Graceful Degradation**
   - Cache successful queries
   - Show partial data when available
   - Provide alternative data sources

## Need More Help?

If issues persist:

1. **Check Network Tab**
   - Look for WebSocket connection in browser DevTools
   - Check request/response headers
   - Verify connection upgrade to WebSocket

2. **Enable Debug Logging**
   - Set `localStorage.debug = 'explorer:*'`
   - Reload page and check console

3. **Report Issue**
   - Include browser version
   - Include console error logs
   - Include network trace if possible
   - Note which chain and block number