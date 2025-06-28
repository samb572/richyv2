/**

- NBA Data Loading Utilities
- Functions for loading and searching NBA statistical data
  */

const fs = require(‘fs’);
const path = require(‘path’);

/**

- Load all NBA data files
- @returns {Object} Object containing all loaded data
  */
  function loadAllData() {
  try {
  const dataDir = path.join(process.cwd(), ‘data’);
  
  const playerStatsPath = path.join(dataDir, ‘nba_player_stats_2024_25.json’);
  const teamPacePath = path.join(dataDir, ‘nba_team_pace_2024_25.json’);
  const dvpPath = path.join(dataDir, ‘nba_dvp_2024_25.json’);
  
  const playerStats = JSON.parse(fs.readFileSync(playerStatsPath, ‘utf8’));
  const teamPace = JSON.parse(fs.readFileSync(teamPacePath, ‘utf8’));
  const dvpData = JSON.parse(fs.readFileSync(dvpPath, ‘utf8’));
  
  return {
  success: true,
  data: {
  playerStats,
  teamPace,
  dvpData
  }
  };
  } catch (error) {
  return {
  success: false,
  error: `Failed to load data: ${error.message}`
  };
  }
  }

/**

- Search for a player by name with fuzzy matching
- @param {Object} playerStats - Player statistics data
- @param {string} playerName - Name to search for
- @returns {Object|null} Player data or null if not found
  */
  function findPlayer(playerStats, playerName) {
  if (!playerStats?.nba_player_stats_2024_25?.players) {
  return null;
  }

const players = playerStats.nba_player_stats_2024_25.players;
const searchName = playerName.toLowerCase().trim();

// Exact match first
let player = players.find(p =>
p.player.toLowerCase() === searchName
);

if (player) return player;

// Partial match - player name contains search term
player = players.find(p =>
p.player.toLowerCase().includes(searchName)
);

if (player) return player;

// Reverse partial match - search term contains player name parts
player = players.find(p => {
const nameParts = p.player.toLowerCase().split(’ ’);
return nameParts.some(part => searchName.includes(part) && part.length > 2);
});

if (player) return player;

// Last name match
player = players.find(p => {
const lastName = p.player.split(’ ’).pop().toLowerCase();
return lastName === searchName || searchName.includes(lastName);
});

return player || null;
}

/**

- Find team pace data by team abbreviation
- @param {Object} teamPace - Team pace data
- @param {string} teamAbbr - Team abbreviation (e.g., ‘LAL’)
- @returns {Object|null} Team pace data or null if not found
  */
  function findTeamPace(teamPace, teamAbbr) {
  if (!teamPace?.nba_team_pace_2024_25?.teams) {
  return null;
  }

return teamPace.nba_team_pace_2024_25.teams.find(team =>
team.team.toLowerCase() === teamAbbr.toLowerCase()
) || null;
}

/**

- Find defense vs position data
- @param {Object} dvpData - DVP data
- @param {string} teamAbbr - Team abbreviation
- @param {string} position - Player position (PG, SG, SF, PF, C)
- @returns {Object} DVP factors or default values
  */
  function findDVP(dvpData, teamAbbr, position) {
  const defaultDVP = {
  dvp_fga_factor: 1.0,
  dvp_fta_factor: 1.0,
  fanduel_points_allowed: null,
  rank_defense: null
  };

if (!dvpData?.nba_defense_vs_position_2024_25?.teams) {
return defaultDVP;
}

const team = dvpData.nba_defense_vs_position_2024_25.teams.find(team =>
team.team.toLowerCase() === teamAbbr.toLowerCase()
);

if (!team || !team.defense_vs_position || !team.defense_vs_position[position]) {
return defaultDVP;
}

return {
dvp_fga_factor: team.defense_vs_position[position].dvp_fga_factor || 1.0,
dvp_fta_factor: team.defense_vs_position[position].dvp_fta_factor || 1.0,
fanduel_points_allowed: team.defense_vs_position[position].fanduel_points_allowed,
rank_defense: team.defense_vs_position[position].rank_defense
};
}

/**

- Get league average pace
- @param {Object} teamPace - Team pace data
- @returns {number} League average pace
  */
  function getLeagueAveragePace(teamPace) {
  if (teamPace?.nba_team_pace_2024_25?.league_average_pace) {
  return teamPace.nba_team_pace_2024_25.league_average_pace;
  }

// Calculate from team data if not available
if (teamPace?.nba_team_pace_2024_25?.teams) {
const teams = teamPace.nba_team_pace_2024_25.teams;
const totalPace = teams.reduce((sum, team) => sum + (team.pace || 0), 0);
return totalPace / teams.length;
}

return 100.8; // Default NBA pace if no data available
}

/**

- Get all available players for autocomplete
- @param {Object} playerStats - Player statistics data
- @returns {Array} Array of player names
  */
  function getAllPlayerNames(playerStats) {
  if (!playerStats?.nba_player_stats_2024_25?.players) {
  return [];
  }

return playerStats.nba_player_stats_2024_25.players.map(player => ({
name: player.player,
team: player.team,
position: player.position,
ppg: player.points_per_game
}));
}

/**

- Get all team abbreviations and names
- @param {Object} teamPace - Team pace data
- @returns {Array} Array of team data
  */
  function getAllTeams(teamPace) {
  if (!teamPace?.nba_team_pace_2024_25?.teams) {
  return [];
  }

return teamPace.nba_team_pace_2024_25.teams.map(team => ({
abbr: team.team,
name: team.team_name,
pace: team.pace,
rank: team.rank
}));
}

/**

- Validate that all required data is present
- @param {Object} data - All loaded data
- @returns {Object} Validation result
  */
  function validateData(data) {
  const { playerStats, teamPace, dvpData } = data;

const errors = [];

// Check player stats
if (!playerStats?.nba_player_stats_2024_25?.players?.length) {
errors.push(‘Player statistics data is missing or empty’);
}

// Check team pace
if (!teamPace?.nba_team_pace_2024_25?.teams?.length) {
errors.push(‘Team pace data is missing or empty’);
}

// Check DVP data
if (!dvpData?.nba_defense_vs_position_2024_25?.teams?.length) {
errors.push(‘Defense vs Position data is missing or empty’);
}

return {
isValid: errors.length === 0,
errors,
stats: {
playerCount: playerStats?.nba_player_stats_2024_25?.players?.length || 0,
teamCount: teamPace?.nba_team_pace_2024_25?.teams?.length || 0,
dvpTeamCount: dvpData?.nba_defense_vs_position_2024_25?.teams?.length || 0
}
};
}

/**

- Search players by partial name match
- @param {Object} playerStats - Player statistics data
- @param {string} searchTerm - Search term
- @param {number} limit - Maximum number of results
- @returns {Array} Array of matching players
  */
  function searchPlayers(playerStats, searchTerm, limit = 10) {
  if (!playerStats?.nba_player_stats_2024_25?.players || !searchTerm) {
  return [];
  }

const players = playerStats.nba_player_stats_2024_25.players;
const search = searchTerm.toLowerCase().trim();

const matches = players.filter(player =>
player.player.toLowerCase().includes(search)
);

// Sort by relevance (exact matches first, then by name length)
matches.sort((a, b) => {
const aLower = a.player.toLowerCase();
const bLower = b.player.toLowerCase();

```
// Exact match priority
if (aLower === search) return -1;
if (bLower === search) return 1;

// Starts with search term priority
if (aLower.startsWith(search) && !bLower.startsWith(search)) return -1;
if (bLower.startsWith(search) && !aLower.startsWith(search)) return 1;

// Shorter names first (more likely to be relevant)
return a.player.length - b.player.length;
```

});

return matches.slice(0, limit).map(player => ({
name: player.player,
team: player.team,
position: player.position,
ppg: player.points_per_game
}));
}

module.exports = {
loadAllData,
findPlayer,
findTeamPace,
findDVP,
getLeagueAveragePace,
getAllPlayerNames,
getAllTeams,
validateData,
searchPlayers
};
