// Test decoder for manual event data analysis
import { QuantumDecoder } from './decoder';

// The hex data from block 113346
const eventHex = "0x1c021206fb451c81b2f4893e3600000000000000fb55c1559bf5893e36000000000000000000000000000000222f1140551702000001050100008e5c213d9823e9ebbda6336bb2a573bc0595fe996b920e013d4529ae291430f97208a7bd6c4c77bf5469db08ca538d921184994790edc232256ad3040000000058703fc8499c1e21dee214fa867bce5cb81f65d7601d8d1aea5758b65845ab463421e3dd615eeb45ccde2b3b9cfe4b6aa9c3a3739ba2e2e087df57040000816b0100000000000001020a6c23efc474506a3baa15b34e972f10bfd06cfcd1bcbbed6274f5f03f21c41ad500a0724e180900000000000000000000000107006c23efc474506a3baa15b34e972f10bfd06cfcd1bcbbed6274f5f03f21c41ad500a0724e1809000000000000000000000001020a6d6f646c70792f747273727900000000000000000000000000000000000000000010a5d4e80000000000000000000000000107020010a5d4e8000000000000000000000000";

// Manual decoder for debugging
class ManualEventDecoder {
  private data: Uint8Array;
  private offset: number = 0;

  constructor(hex: string) {
    // Remove 0x prefix if present
    const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
    this.data = new Uint8Array(cleanHex.length / 2);
    for (let i = 0; i < cleanHex.length; i += 2) {
      this.data[i / 2] = parseInt(cleanHex.substr(i, 2), 16);
    }
  }

  readU8(): number {
    if (this.offset >= this.data.length) {
      throw new Error(`Buffer underflow at offset ${this.offset}`);
    }
    return this.data[this.offset++];
  }

  readCompact(): number {
    const first = this.readU8();
    const mode = first & 0x03;

    if (mode === 0) {
      return first >> 2;
    } else if (mode === 1) {
      const second = this.readU8();
      return ((first >> 2) | (second << 6));
    } else if (mode === 2) {
      const b2 = this.readU8();
      const b3 = this.readU8();
      const b4 = this.readU8();
      return ((first >> 2) | (b2 << 6) | (b3 << 14) | (b4 << 22));
    } else {
      throw new Error('BigInt compact encoding not supported in test');
    }
  }

  readBytes(length: number): Uint8Array {
    if (this.offset + length > this.data.length) {
      throw new Error(`Buffer underflow: need ${length} bytes at offset ${this.offset}`);
    }
    const result = this.data.slice(this.offset, this.offset + length);
    this.offset += length;
    return result;
  }

  bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  decode() {
    console.log('Starting manual decode of event data...');
    console.log(`Total data length: ${this.data.length} bytes`);
    
    try {
      // Read event count
      const eventCount = this.readCompact();
      console.log(`\nEvent count: ${eventCount}`);
      
      for (let i = 0; i < eventCount; i++) {
        console.log(`\n--- Event ${i + 1} ---`);
        const startOffset = this.offset;
        
        // Read phase
        const phaseType = this.readU8();
        console.log(`Phase type: 0x${phaseType.toString(16)}`);
        
        if (phaseType === 0x00) {
          const extrinsicIndex = this.readU8() | (this.readU8() << 8) | (this.readU8() << 16) | (this.readU8() << 24);
          console.log(`ApplyExtrinsic: ${extrinsicIndex}`);
        } else if (phaseType === 0x01) {
          console.log('Finalization');
        } else if (phaseType === 0x02) {
          console.log('Initialization');
        }
        
        // Read pallet index and event index
        const palletIndex = this.readU8();
        const eventIndex = this.readU8();
        console.log(`Pallet: ${palletIndex}, Event: ${eventIndex}`);
        
        // The rest is event data - try to read some bytes
        console.log(`Offset before event data: ${this.offset}`);
        
        // For debugging, let's read the next 32 bytes (or until end)
        const remainingBytes = Math.min(32, this.data.length - this.offset);
        if (remainingBytes > 0) {
          const eventDataPreview = this.readBytes(remainingBytes);
          console.log(`Event data preview (${remainingBytes} bytes): 0x${this.bytesToHex(eventDataPreview)}`);
          this.offset -= remainingBytes; // Reset to continue parsing
        }
        
        // Try to guess event structure based on pallet
        if (palletIndex === 0) { // System pallet
          console.log('System pallet event');
        } else if (palletIndex === 1) { // Likely timestamp
          console.log('Timestamp pallet event');
        } else if (palletIndex === 10) { // Often balances
          console.log('Possibly balances pallet event');
          // Try to read account (32 bytes) and amount
          if (this.data.length - this.offset >= 32) {
            const account = this.readBytes(32);
            console.log(`Account?: 0x${this.bytesToHex(account)}`);
          }
        }
        
        console.log(`Bytes consumed for this event: ${this.offset - startOffset}`);
      }
      
      console.log(`\nTotal bytes parsed: ${this.offset}`);
      console.log(`Remaining bytes: ${this.data.length - this.offset}`);
      
    } catch (error) {
      console.error('Error during decode:', error);
      console.log(`Failed at offset: ${this.offset}`);
      
      // Show hex context around error
      const contextStart = Math.max(0, this.offset - 16);
      const contextEnd = Math.min(this.data.length, this.offset + 16);
      const context = this.data.slice(contextStart, contextEnd);
      console.log(`Context around error offset ${this.offset}:`);
      console.log(`0x${this.bytesToHex(context)}`);
    }
  }
}

// Run the test
console.log('Testing manual event decoder...\n');
const decoder = new ManualEventDecoder(eventHex);
decoder.decode();

// Also try with the quantum decoder
console.log('\n\nTrying quantum decoder...');
try {
  const events = QuantumDecoder.decodeEventsFromHex(eventHex);
  console.log(`Quantum decoder found ${events.length} events`);
  events.forEach((event, idx) => {
    console.log(`Event ${idx + 1}:`, event);
  });
} catch (error) {
  console.error('Quantum decoder error:', error);
}