#!/usr/bin/env python3
"""
Standalone Valorant stats fetcher for ayje#888.
Uses Henrik's public Valorant API (https://docs.henrikdev.xyz/).
This script is independent and does not touch any project code.

Usage:
    python3 valorant-stats/fetch-stats.py
    python3 valorant-stats/fetch-stats.py --name "ayje" --tag "888"
"""

import argparse
import json
import sys
import urllib.parse
import urllib.request
import urllib.error

API_BASE = "https://api.henrikdev.xyz/valorant"
REGIONS = ["na", "eu", "ap", "kr"]


def fetch_json(url):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "ValorantStatsFetcher/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
            if data.get("status") == 200:
                return data.get("data", {})
    except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError, TimeoutError):
        pass
    return None


def print_header(name, tag):
    print("=" * 50)
    print(f"  Valorant Stats for {name}#{tag}")
    print("=" * 50)
    print()


def fetch_account(name, tag):
    print(">>> Account Info")
    data = fetch_json(f"{API_BASE}/v1/account/{urllib.parse.quote(name)}/{urllib.parse.quote(tag)}")
    if data:
        print(f"  Name:    {data.get('name', 'N/A')}#{data.get('tag', 'N/A')}")
        print(f"  Region:  {data.get('region', 'N/A')}")
        print(f"  Level:   {data.get('account_level', 'N/A')}")
        card = data.get("card", {})
        if card.get("small"):
            print(f"  Card:    {card['small']}")
        print()
        return data.get("region")
    else:
        print("  Could not fetch account info (API may be rate-limited or profile is private).")
        print()
        return None


def fetch_mmr(name, tag, hint_region=None):
    print(">>> Competitive Rank")
    regions = [hint_region] + [r for r in REGIONS if r != hint_region] if hint_region else REGIONS
    for region in regions:
        data = fetch_json(f"{API_BASE}/v2/mmr/{region}/{urllib.parse.quote(name)}/{urllib.parse.quote(tag)}")
        if data:
            cur = data.get("current_data", {})
            high = data.get("highest_rank", {})
            print(f"  Region:          {region.upper()}")
            print(f"  Current Rank:    {cur.get('currenttierpatched', 'Unranked')}")
            print(f"  Ranking Points:  {cur.get('ranking_in_tier', 'N/A')}")
            print(f"  MMR Change:      {cur.get('mmr_change_to_last_game', 'N/A')}")
            print(f"  ELO:             {cur.get('elo', 'N/A')}")
            if high.get("patched_tier"):
                print(f"  Peak Rank:       {high['patched_tier']} (Season {high.get('season', 'N/A')})")
            print()
            return region
    print("  No ranked data found across any region.")
    print()
    return None


def fetch_matches(name, tag, hint_region=None, count=5):
    print(f">>> Recent Matches (last {count})")
    regions = [hint_region] + [r for r in REGIONS if r != hint_region] if hint_region else REGIONS
    for region in regions:
        data = fetch_json(f"{API_BASE}/v3/matches/{region}/{urllib.parse.quote(name)}/{urllib.parse.quote(tag)}?size={count}")
        if data and isinstance(data, list) and len(data) > 0:
            print(f"  Region: {region.upper()}")
            print()
            total_kills, total_deaths, total_assists = 0, 0, 0
            wins, losses = 0, 0

            for i, match in enumerate(data):
                meta = match.get("metadata", {})
                mode = meta.get("mode", "Unknown")
                map_name = meta.get("map", "Unknown")
                game_start = meta.get("game_start_patched", "Unknown")

                players = match.get("players", {}).get("all_players", [])
                me = next(
                    (p for p in players
                     if p.get("name", "").lower() == name.lower() and p.get("tag", "") == tag),
                    None
                )

                if me:
                    agent = me.get("character", "Unknown")
                    kills = me.get("stats", {}).get("kills", 0)
                    deaths = me.get("stats", {}).get("deaths", 0)
                    assists = me.get("stats", {}).get("assists", 0)
                    score = me.get("stats", {}).get("score", 0)
                    team = me.get("team", "").lower()

                    teams = match.get("teams", {})
                    if team == "red":
                        my_rounds = teams.get("red", {}).get("rounds_won", 0)
                        opp_rounds = teams.get("blue", {}).get("rounds_won", 0)
                        won = teams.get("red", {}).get("has_won", False)
                    else:
                        my_rounds = teams.get("blue", {}).get("rounds_won", 0)
                        opp_rounds = teams.get("red", {}).get("rounds_won", 0)
                        won = teams.get("blue", {}).get("has_won", False)

                    total_rounds = max(int(my_rounds or 0) + int(opp_rounds or 0), 1)
                    result = "WIN" if won else "LOSS"
                    kd = f"{kills / deaths:.2f}" if deaths > 0 else f"{kills:.0f}.00"
                    acs = round(score / total_rounds)

                    total_kills += kills
                    total_deaths += deaths
                    total_assists += assists
                    if won:
                        wins += 1
                    else:
                        losses += 1

                    print(f"  Match {i + 1}: {mode} on {map_name}")
                    print(f"    Date:     {game_start}")
                    print(f"    Agent:    {agent}")
                    print(f"    Result:   {result} ({my_rounds}-{opp_rounds})")
                    print(f"    K/D/A:    {kills}/{deaths}/{assists}  (KD: {kd})")
                    print(f"    ACS:      {acs}")
                    print()
                else:
                    print(f"  Match {i + 1}: {mode} on {map_name} (player data not found)")
                    print()

            if total_kills + total_deaths > 0:
                print("  --- Summary (recent matches) ---")
                overall_kd = f"{total_kills / total_deaths:.2f}" if total_deaths > 0 else "N/A"
                print(f"  Total K/D/A:  {total_kills}/{total_deaths}/{total_assists}")
                print(f"  Overall KD:   {overall_kd}")
                print(f"  Win Rate:     {wins}W - {losses}L ({wins / (wins + losses) * 100:.0f}%)" if (wins + losses) > 0 else "")
                print()
            return
    print("  No match data found across any region.")
    print()


def main():
    parser = argparse.ArgumentParser(description="Fetch Valorant stats")
    parser.add_argument("--name", default="SWXG ayje", help="Riot ID name (default: SWXG ayje)")
    parser.add_argument("--tag", default="888", help="Riot ID tag (default: 888)")
    parser.add_argument("--matches", type=int, default=5, help="Number of recent matches to fetch (default: 5)")
    args = parser.parse_args()

    print_header(args.name, args.tag)
    region = fetch_account(args.name, args.tag)
    found_region = fetch_mmr(args.name, args.tag, hint_region=region)
    fetch_matches(args.name, args.tag, hint_region=found_region or region, count=args.matches)

    print("=" * 50)
    print("  Data via Henrik Valorant API (henrikdev.xyz)")
    print("=" * 50)


if __name__ == "__main__":
    main()
