const { db, initializeDatabase } = require('../src/models/db'); 

async function seedDomainTrustProfiles() {
    await initializeDatabase(); 

    const domainsToSeed = [
        // High-Trust TLD Patterns & Specific Domains
        { domain_pattern: '*.gov', tld_type_bonus: 0.8, is_https: true, description: 'Generic Government TLD' },
        { domain_pattern: '*.gc.ca', tld_type_bonus: 0.8, is_https: true, description: 'Canadian Government' },
        { domain_pattern: '*.gov.uk', tld_type_bonus: 0.8, is_https: true, description: 'UK Government' },
        { domain_pattern: '*.gov.au', tld_type_bonus: 0.8, is_https: true, description: 'Australian Government' },
        { domain_pattern: '*.bund.de', tld_type_bonus: 0.8, is_https: true, description: 'German Federal Government' },
        { domain_pattern: '*.gouv.fr', tld_type_bonus: 0.8, is_https: true, description: 'French Government' },
        { domain_pattern: '*.gov.it', tld_type_bonus: 0.8, is_https: true, description: 'Italian Government' },
        { domain_pattern: '*.gob.es', tld_type_bonus: 0.8, is_https: true, description: 'Spanish Government' },
        { domain_pattern: '*.europa.eu', tld_type_bonus: 0.85, is_https: true, description: 'Official EU Bodies' }, 
        { domain_pattern: '*.admin.ch', tld_type_bonus: 0.8, is_https: true, description: 'Swiss Government' },
        { domain_pattern: '*.overheid.nl', tld_type_bonus: 0.8, is_https: true, description: 'Netherlands Government' },
        { domain_pattern: '*.gov.se', tld_type_bonus: 0.8, is_https: true, description: 'Swedish Government' },
        { domain_pattern: '*.dep.no', tld_type_bonus: 0.8, is_https: true, description: 'Norwegian Ministries' }, 
        { domain_pattern: 'regjeringen.no', tld_type_bonus: 0.8, is_https: true, description: 'Norwegian Government' }, 
        { domain_pattern: '*.go.jp', tld_type_bonus: 0.8, is_https: true, description: 'Japanese Government' },
        { domain_pattern: '*.go.kr', tld_type_bonus: 0.8, is_https: true, description: 'South Korean Government' },
        { domain_pattern: '*.gov.in', tld_type_bonus: 0.8, is_https: true, description: 'Indian Government' },
        { domain_pattern: '*.nic.in', tld_type_bonus: 0.75, is_https: true, description: 'Indian National Informatics Centre (often hosts gov sites)' },
        { domain_pattern: '*.gov.cn', tld_type_bonus: 0.8, is_https: true, description: 'Chinese Government' },
        { domain_pattern: '*.gov.sg', tld_type_bonus: 0.8, is_https: true, description: 'Singapore Government' },
        { domain_pattern: '*.go.id', tld_type_bonus: 0.8, is_https: true, description: 'Indonesian Government' },
        { domain_pattern: '*.gov.sa', tld_type_bonus: 0.8, is_https: true, description: 'Saudi Arabian Government' },
        { domain_pattern: '*.gov.tr', tld_type_bonus: 0.8, is_https: true, description: 'Turkish Government' },
        { domain_pattern: '*.govt.nz', tld_type_bonus: 0.8, is_https: true, description: 'New Zealand Government' },
        { domain_pattern: '*.gov.br', tld_type_bonus: 0.8, is_https: true, description: 'Brazilian Government' },
        { domain_pattern: '*.gob.ar', tld_type_bonus: 0.8, is_https: true, description: 'Argentinian Government' },
        { domain_pattern: '*.gov.za', tld_type_bonus: 0.8, is_https: true, description: 'South African Government' },
        { domain_pattern: '*.edu', tld_type_bonus: 0.75, is_https: true, description: 'Generic Educational TLD (primarily US)' },
        { domain_pattern: '*.ac.uk', tld_type_bonus: 0.75, is_https: true, description: 'UK Academic Institutions' },
        { domain_pattern: '*.wikipedia.org', tld_type_bonus: 0.7, is_https: true, description: 'Wikipedia and its subdomains' },
        { domain_pattern: 'stackoverflow.com', tld_type_bonus: 0.7, is_https: true, description: 'Stack Overflow' },
        { domain_pattern: 'developer.mozilla.org', tld_type_bonus: 0.75, is_https: true, description: 'MDN Web Docs' },
        { domain_pattern: 'python.org', tld_type_bonus: 0.75, is_https: true, description: 'Official Python Site' },
        { domain_pattern: 'w3.org', tld_type_bonus: 0.75, is_https: true, description: 'World Wide Web Consortium (W3C)' },
        { domain_pattern: 'ietf.org', tld_type_bonus: 0.75, is_https: true, description: 'Internet Engineering Task Force (IETF)' },
        { domain_pattern: 'nature.com', tld_type_bonus: 0.8, is_https: true, description: 'Nature Journal' },
        { domain_pattern: 'sciencemag.org', tld_type_bonus: 0.8, is_https: true, description: 'Science Magazine (AAAS)' },
        { domain_pattern: 'reuters.com', tld_type_bonus: 0.7, is_https: true, description: 'Reuters News' },
        { domain_pattern: 'apnews.com', tld_type_bonus: 0.7, is_https: true, description: 'Associated Press News' },
        { domain_pattern: '*.un.org', tld_type_bonus: 0.8, is_https: true, description: 'United Nations' },
        { domain_pattern: '*.who.int', tld_type_bonus: 0.8, is_https: true, description: 'World Health Organization' },
        { domain_pattern: '*.worldbank.org', tld_type_bonus: 0.8, is_https: true, description: 'World Bank' },
        { domain_pattern: '*.imf.org', tld_type_bonus: 0.8, is_https: true, description: 'International Monetary Fund' },
        { domain_pattern: '*.nato.int', tld_type_bonus: 0.8, is_https: true, description: 'NATO' },
    ];

    let insertedCount = 0;
    let skippedCount = 0;

    for (const item of domainsToSeed) {
        // Calculate initial trust_score based on tld_type_bonus and https_bonus
        // This is a simple initial calculation; the daily job will refine it.
        let initialScore = 0.5; // Neutral base
        if (item.tld_type_bonus) initialScore += item.tld_type_bonus * 0.3; // Weight for TLD bonus
        if (item.is_https) initialScore += 0.1; // Small HTTPS bonus
        initialScore = Math.max(0, Math.min(1, initialScore)); // Clamp between 0 and 1

        try {
            await db.runAsync(
                `INSERT INTO domain_trust_profiles (domain, tld_type_bonus, is_https, trust_score, description, last_scanned_date)
                 VALUES (?, ?, ?, ?, ?, ?)
                 ON CONFLICT(domain) DO UPDATE SET
                 tld_type_bonus = excluded.tld_type_bonus,
                 is_https = excluded.is_https,
                 trust_score = excluded.trust_score, -- Update score if entry exists but needs new bonus
                 description = excluded.description,
                 updated_at = CURRENT_TIMESTAMP`,
                [
                    item.domain_pattern,
                    item.tld_type_bonus || 0,
                    item.is_https !== undefined ? item.is_https : null,
                    initialScore,
                    item.description || null,
                    null 
                ]
            );
            insertedCount++;
        } catch (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                console.warn(`Domain/Pattern "${item.domain_pattern}" already exists or conflict during update. Skipping.`);
                skippedCount++;
            } else {
                console.error(`Error inserting/updating domain "${item.domain_pattern}":`, err);
            }
        }
    }
    console.log(`Seeding complete. Inserted/Updated: ${insertedCount}, Skipped (due to existing or conflict): ${skippedCount}`);
}

if (require.main === module) {
    seedDomainTrustProfiles()
        .then(() => {
            console.log('Domain trust profiles seeded successfully.');
            process.exit(0);
        })
        .catch(err => {
            console.error('Failed to seed domain trust profiles:', err);
            process.exit(1);
        });
}

module.exports = { seedDomainTrustProfiles };
