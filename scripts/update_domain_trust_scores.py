import sqlite3
import os
import time
import requests
from bs4 import BeautifulSoup
from urllib.parse import urlparse, urljoin
from datetime import datetime, timedelta
import whois
import random

# --- Configuration ---
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
DB_PATH = os.path.join(PROJECT_ROOT, 'data', 'community.db') 
print(f"[UpdateDomainTrustScores] Resolved DB_PATH: {DB_PATH}") 
USER_AGENT = "ScalyticsTrustRanker/1.0 (+https://scalytics.io/bot)"
REQUEST_TIMEOUT = 10 
SCAN_RECENCY_THRESHOLD_DAYS = 7 
DOMAINS_TO_PROCESS_PER_RUN = 100 

# WHOIS Cache (can be shared if run frequently, but for a daily script, it's less critical)
WHOIS_CACHE = {}
WHOIS_CACHE_EXPIRY_SECONDS = 3600 * 24 

# --- Helper Functions ---
def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def get_domain_from_url(url_string: str) -> str | None:
    if not url_string or not url_string.startswith(('http://', 'https://')):
        return None
    try:
        parsed_url = urlparse(url_string)
        return parsed_url.netloc.replace('www.', '')
    except Exception:
        return None

def is_https(url_string: str) -> bool:
    if not url_string: return False
    try:
        return urlparse(url_string).scheme == 'https'
    except Exception:
        return False

def get_domain_age_days(domain: str) -> int | None:
    if not domain: return None
    cached_entry = WHOIS_CACHE.get(domain)
    if cached_entry and (datetime.now() - cached_entry['timestamp']) < timedelta(seconds=WHOIS_CACHE_EXPIRY_SECONDS):
        return cached_entry['age_days']
    try:
        domain_info = whois.whois(domain)
        creation_date = domain_info.creation_date
        if isinstance(creation_date, list): creation_date = creation_date[0]
        if creation_date:
            age = (datetime.now() - creation_date).days
            WHOIS_CACHE[domain] = {'age_days': age, 'timestamp': datetime.now()}
            return age
        return None
    except Exception:
        WHOIS_CACHE[domain] = {'age_days': None, 'timestamp': datetime.now()}
        return None

def fetch_page_content(url: str) -> str | None:
    try:
        headers = {'User-Agent': USER_AGENT}
        response = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
        response.raise_for_status()
        return response.text
    except requests.RequestException:
        return None

def extract_outbound_links(html_content: str, base_url: str) -> set[str]:
    links = set()
    if not html_content: return links
    soup = BeautifulSoup(html_content, 'html.parser')
    for a_tag in soup.find_all('a', href=True):
        href = a_tag['href']
        if href.startswith('mailto:') or href.startswith('tel:') or href.startswith('#'):
            continue
        try:
            full_url = urljoin(base_url, href)
            parsed_full_url = urlparse(full_url)
            if parsed_full_url.scheme in ['http', 'https'] and parsed_full_url.netloc:
                links.add(full_url)
        except Exception:
            continue # Ignore malformed URLs
    return links

def calculate_trust_score(profile: sqlite3.Row, 
                          outbound_high_trust_count: int, 
                          outbound_medium_trust_count: int,
                          outbound_low_trust_count: int,
                          total_outbound_links: int) -> float:
    score = 0.5 

    # TLD Bonus (already in profile.tld_type_bonus)
    score += profile['tld_type_bonus'] if profile['tld_type_bonus'] is not None else 0.0
    
    # HTTPS Bonus
    if profile['is_https']:
        score += 0.1
    else: # Penalize for no HTTPS on a site that should have it
        score -= 0.05 

    # Age Bonus
    if profile['domain_age_days'] is not None:
        if profile['domain_age_days'] > 365 * 5: # 5+ years
            score += 0.15
        elif profile['domain_age_days'] > 365 * 2: # 2-5 years
            score += 0.1
        elif profile['domain_age_days'] < 180: # Less than 6 months
            score -= 0.1

    # Outbound Link Quality Score
    if total_outbound_links > 0:
        # Weighted score: high trust links are very positive, low trust links are very negative
        link_quality_metric = (
            (outbound_high_trust_count * 1.0) + 
            (outbound_medium_trust_count * 0.5) -
            (outbound_low_trust_count * 1.0) 
        ) / total_outbound_links
        
        # Scale this metric to a bonus/penalty (e.g., -0.2 to +0.2)
        link_bonus = link_quality_metric * 0.2 
        score += link_bonus
    else: 
        score -= 0.02 # Slight penalty for not linking out (or not being scannable)

    # Clamp score between 0.0 and 1.0
    return max(0.0, min(1.0, score))


def main():
    print(f"Starting domain trust score update process at {datetime.now()}")
    conn = get_db_connection()
    if not conn:
        print("Failed to connect to the database. Exiting.")
        return

    try:
        cursor = conn.cursor()
        
        # Select domains that are provisional or haven't been scanned recently
        # and meet the minimum reference count.
        cutoff_date = (datetime.now() - timedelta(days=SCAN_RECENCY_THRESHOLD_DAYS)).strftime('%Y-%m-%d %H:%M:%S')
        min_reference_count = 2 # Only score domains referenced 2 or more times

        cursor.execute(f"""
            SELECT * FROM domain_trust_profiles
            WHERE (last_scanned_date IS NULL OR last_scanned_date < ?)
            AND reference_count >= ?
            ORDER BY reference_count DESC, last_scanned_date ASC, created_at ASC
            LIMIT ?
        """, (cutoff_date, min_reference_count, DOMAINS_TO_PROCESS_PER_RUN))
        
        domains_to_update = cursor.fetchall()
        print(f"Found {len(domains_to_update)} domains to update.")

        for profile in domains_to_update:
            domain = profile['domain']
            print(f"Processing domain: {domain} (ID: {profile['id']})")
            
            # 1. Update basic live signals (HTTPS, Age)
            # Construct a plausible URL to check HTTPS, e.g., homepage
            # For TLD patterns like '*.gov', this step is less meaningful for the pattern itself
            # but the individual domains matching it would have had their own live checks.
            # Here, we focus on specific domains.
            is_pattern = domain.startswith('*.') 
            current_is_https = profile['is_https']
            current_age_days = profile['domain_age_days']

            if not is_pattern: 
                test_url = f"https://{domain}" 
                current_is_https = is_https(test_url) 
                current_age_days = get_domain_age_days(domain)
            
            # 2. Outbound Link Analysis (for specific domains)
            outbound_high_trust = 0
            outbound_medium_trust = 0
            outbound_low_trust = 0
            total_outbound = 0

            if not is_pattern:
                homepage_url = f"https://{domain}" 
                html_content = fetch_page_content(homepage_url)
                if not html_content:
                    homepage_url = f"http://{domain}" 
                    html_content = fetch_page_content(homepage_url)

                if html_content:
                    outbound_urls = extract_outbound_links(html_content, homepage_url)
                    total_outbound = len(outbound_urls)
                    
                    for link_url in outbound_urls:
                        linked_domain = get_domain_from_url(link_url)
                        if linked_domain and linked_domain != domain: 
                            cursor.execute("SELECT trust_score FROM domain_trust_profiles WHERE domain = ?", (linked_domain,))
                            linked_profile = cursor.fetchone()
                            if linked_profile and linked_profile['trust_score'] is not None:
                                if linked_profile['trust_score'] >= 0.7:
                                    outbound_high_trust += 1
                                elif linked_profile['trust_score'] >= 0.4:
                                    outbound_medium_trust += 1
                                else:
                                    outbound_low_trust += 1
                    print(f"  Outbound links for {domain}: Total={total_outbound}, High={outbound_high_trust}, Med={outbound_medium_trust}, Low={outbound_low_trust}")
                else:
                    print(f"  Could not fetch homepage content for {domain} to analyze outbound links.")
            
            # 3. Recalculate Trust Score
            # Create a temporary profile dict for calculate_trust_score
            temp_profile_data = dict(profile)
            temp_profile_data['is_https'] = current_is_https
            temp_profile_data['domain_age_days'] = current_age_days
            
            new_trust_score = calculate_trust_score(temp_profile_data, outbound_high_trust, outbound_medium_trust, outbound_low_trust, total_outbound)
            
            # 4. Update Database
            cursor.execute("""
                UPDATE domain_trust_profiles
                SET trust_score = ?, 
                    is_https = ?, 
                    domain_age_days = ?,
                    outbound_links_to_high_trust_count = ?,
                    outbound_links_to_medium_trust_count = ?,
                    outbound_links_to_low_trust_count = ?,
                    total_outbound_links_scanned = ?,
                    last_scanned_date = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            """, (new_trust_score, current_is_https, current_age_days, 
                  outbound_high_trust, outbound_medium_trust, outbound_low_trust, total_outbound,
                  profile['id']))
            conn.commit()
            print(f"  Updated {domain}: New Score = {new_trust_score:.3f}")
            
            time.sleep(random.uniform(1, 3)) # Be a good bot, wait between domains :)

        print(f"Domain trust score update process finished at {datetime.now()}")

    except sqlite3.Error as e:
        print(f"Database error during trust score update: {e}")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    main()
