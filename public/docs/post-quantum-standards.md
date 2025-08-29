# Understanding Post-Quantum Cryptography Standards

## Why Quantum-Safe Cryptography Matters

Current encryption methods that secure everything from online banking to private messages rely on mathematical problems that are extremely difficult for today's computers to solve. However, quantum computers—which operate on fundamentally different principles—will be able to break these encryption methods in seconds rather than centuries.

This isn't science fiction: quantum computers capable of breaking current encryption are expected within 10-20 years. That's why organizations worldwide are transitioning to **quantum-resistant** or **post-quantum** cryptography now.

## The Security Indicators Explained

### 🛡️ NIST FIPS Standards (Highest Security)

The U.S. National Institute of Standards and Technology (NIST) has standardized three quantum-resistant algorithms after years of rigorous testing:

- **FIPS 204** (ML-DSA/CRYSTALS-Dilithium) - Digital signatures
- **FIPS 205** (ML-DSA/Falcon) - Compact digital signatures  
- **FIPS 203** (ML-KEM/CRYSTALS-Kyber) - Key encapsulation

Projects using these standards represent the gold standard in quantum resistance, having undergone extensive cryptanalysis by the global cryptography community.

### Security Levels

NIST defines five security levels based on how difficult they are to break, even with a quantum computer:

- **Level 5** (🛡️ Highest): As hard to break as AES-256
- **Level 3** (🔒 High): As hard to break as AES-192
- **Level 2** (🔐 Good): As hard to break as SHA-256
- **Level 1** (🔑 Standard): As hard to break as AES-128

Even Level 1 provides strong quantum resistance—these comparisons help cryptographers choose appropriate security margins for different use cases.

### Algorithm Families

Different mathematical approaches to quantum resistance:

- **💎 Lattice-based**: Based on geometric problems in high dimensions. Most NIST standards use this approach due to good performance and flexibility.

- **🔗 Hash-based**: Based on the security of hash functions. Extremely conservative and well-understood, but produces larger signatures.

- **📋 RFC Standards**: Algorithms standardized through the Internet Engineering Task Force (IETF), indicating mature, peer-reviewed specifications.

## Reading the Project Table

### Activity Indicators

The emoji pairs next to each repository show:
1. **Recency**: How recently the project was updated (🔥 = today, 💤 = dormant)
2. **Volume**: How much development activity in the past 30 days (🌊 = very high, 🦥 = none)

### Sorting Modes

- **Balanced**: Prioritizes high-security projects while considering recent activity. Best for finding production-ready quantum-safe solutions.

- **Activity**: Sorts by most recent development. Best for finding actively maintained projects.

- **Security**: Sorts by security level. Best for finding the most quantum-resistant implementations.

## What This Means for You

### If you're a developer:
- Projects with FIPS standards are ready for production use
- Higher activity indicators suggest better community support and maintenance
- Consider your security requirements: Level 1 is sufficient for most applications, while Level 5 is for ultra-high security needs

### If you're evaluating blockchain projects:
- "Active" status with high security levels indicates mature quantum-resistant implementations
- "Testnet" projects are experimenting with cutting-edge approaches
- Projects using ML-DSA (Dilithium) or ML-KEM (Kyber) are following NIST recommendations

### If you're planning long-term:
- Data encrypted today could be stored and decrypted by future quantum computers ("harvest now, decrypt later")
- Projects already implementing post-quantum cryptography are preparing for this threat
- Migration to quantum-safe systems takes years—organizations starting now are ahead of the curve

## The Trade-offs

Quantum-resistant algorithms generally have larger key and signature sizes compared to current methods. For example:
- Traditional signature: ~64 bytes
- Quantum-resistant signature: ~2,000-4,500 bytes

This is why you'll see signature sizes listed in the security column—projects must balance security with practical considerations like blockchain size and network bandwidth.

## Learn More

- [NIST Post-Quantum Cryptography](https://csrc.nist.gov/projects/post-quantum-cryptography)
- [Quantum Computing and Cryptography FAQ](https://www.nist.gov/pqc/faqs)
- [The Quantum Threat Timeline](https://globalriskinstitute.org/publications/quantum-threat-timeline/)

---

*This radar tracks blockchain and distributed ledger projects that have implemented or are implementing quantum-resistant cryptography. It's part of the broader effort to ensure our digital infrastructure remains secure in the quantum era.*