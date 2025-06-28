/**

- NBA Player Projection Calculation Utilities
- Contains core mathematical functions for projecting player performance
  */

/**

- Calculate pace adjustment factor
- @param {number} opponentPace - Opponent team’s pace
- @param {number} leagueAvgPace - League average pace
- @returns {number} Pace adjustment multiplier
  */
  function calculatePaceAdjustment(opponentPace, leagueAvgPace) {
  if (!opponentPace || !leagueAvgPace || leagueAvgPace === 0) {
  return 1.0; // Default to no adjustment if data is missing
  }
  return opponentPace / leagueAvgPace;
  }

/**

- Calculate projected field goal attempts
- @param {number} fga36 - Field goal attempts per 36 minutes
- @param {number} projectedMinutes - Projected minutes for the game
- @param {number} usageAdjustment - Usage rate adjustment factor
- @param {number} dvpFactor - Defense vs Position factor for FGA
- @param {number} paceAdjustment - Pace adjustment factor
- @returns {number} Projected field goal attempts
  */
  function calculateProjectedFGA(fga36, projectedMinutes, usageAdjustment, dvpFactor, paceAdjustment) {
  return fga36 * (projectedMinutes / 36) * usageAdjustment * dvpFactor * paceAdjustment;
  }

/**

- Calculate projected free throw attempts
- @param {number} fta36 - Free throw attempts per 36 minutes
- @param {number} projectedMinutes - Projected minutes for the game
- @param {number} usageAdjustment - Usage rate adjustment factor
- @param {number} dvpFactor - Defense vs Position factor for FTA
- @param {number} paceAdjustment - Pace adjustment factor
- @returns {number} Projected free throw attempts
  */
  function calculateProjectedFTA(fta36, projectedMinutes, usageAdjustment, dvpFactor, paceAdjustment) {
  return fta36 * (projectedMinutes / 36) * usageAdjustment * dvpFactor * paceAdjustment;
  }

/**

- Calculate projected points from two-point field goals
- @param {number} projectedFGA - Total projected field goal attempts
- @param {number} threePointAttemptRate - Rate of 3PA out of total FGA
- @param {number} twoPointPercentage - Two-point field goal percentage
- @returns {number} Projected points from two-point field goals
  */
  function calculateTwoPointPoints(projectedFGA, threePointAttemptRate, twoPointPercentage) {
  const twoPointAttempts = projectedFGA * (1 - threePointAttemptRate);
  return twoPointAttempts * twoPointPercentage * 2;
  }

/**

- Calculate projected points from three-point field goals
- @param {number} projectedFGA - Total projected field goal attempts
- @param {number} threePointAttemptRate - Rate of 3PA out of total FGA
- @param {number} threePointPercentage - Three-point field goal percentage
- @returns {number} Projected points from three-point field goals
  */
  function calculateThreePointPoints(projectedFGA, threePointAttemptRate, threePointPercentage) {
  const threePointAttempts = projectedFGA * threePointAttemptRate;
  return threePointAttempts * threePointPercentage * 3;
  }

/**

- Calculate projected points from free throws
- @param {number} projectedFTA - Projected free throw attempts
- @param {number} freeThrowPercentage - Free throw percentage
- @returns {number} Projected points from free throws
  */
  function calculateFreeThrowPoints(projectedFTA, freeThrowPercentage) {
  return projectedFTA * freeThrowPercentage;
  }

/**

- Main function to calculate total projected points
- @param {Object} playerData - Player statistical data
- @param {Object} gameParams - Game-specific parameters
- @param {Object} adjustments - Various adjustment factors
- @returns {Object} Complete projection with breakdown
  */
  function calculateTotalProjectedPoints(playerData, gameParams, adjustments) {
  try {
  // Extract data
  const {
  FGA_36,
  FTA_36,
  two_point_percentage,
  three_point_percentage,
  free_throw_percentage,
  three_point_attempt_rate
  } = playerData;
  
  const { projectedMinutes, usageAdjustment } = gameParams;
  const { paceAdjustment, dvpFgaFactor, dvpFtaFactor } = adjustments;
  
  // Validate required data
  if (!FGA_36 || !FTA_36 || projectedMinutes <= 0) {
  throw new Error(‘Missing or invalid player data’);
  }
  
  // Calculate projected attempts
  const projectedFGA = calculateProjectedFGA(
  FGA_36,
  projectedMinutes,
  usageAdjustment,
  dvpFgaFactor,
  paceAdjustment
  );
  
  const projectedFTA = calculateProjectedFTA(
  FTA_36,
  projectedMinutes,
  usageAdjustment,
  dvpFtaFactor,
  paceAdjustment
  );
  
  // Calculate points by category
  const twoPointPoints = calculateTwoPointPoints(
  projectedFGA,
  three_point_attempt_rate,
  two_point_percentage
  );
  
  const threePointPoints = calculateThreePointPoints(
  projectedFGA,
  three_point_attempt_rate,
  three_point_percentage
  );
  
  const freeThrowPoints = calculateFreeThrowPoints(
  projectedFTA,
  free_throw_percentage
  );
  
  // Calculate totals
  const totalProjectedPoints = twoPointPoints + threePointPoints + freeThrowPoints;
  
  return {
  projectedPoints: Math.round(totalProjectedPoints * 10) / 10,
  breakdown: {
  twoPointers: Math.round(twoPointPoints * 10) / 10,
  threePointers: Math.round(threePointPoints * 10) / 10,
  freeThrows: Math.round(freeThrowPoints * 10) / 10,
  projectedFGA: Math.round(projectedFGA * 10) / 10,
  projectedFTA: Math.round(projectedFTA * 10) / 10,
  paceAdjustment: Math.round(paceAdjustment * 100) / 100
  },
  attempts: {
  twoPointAttempts: Math.round(projectedFGA * (1 - three_point_attempt_rate) * 10) / 10,
  threePointAttempts: Math.round(projectedFGA * three_point_attempt_rate * 10) / 10,
  freeThrowAttempts: Math.round(projectedFTA * 10) / 10
  }
  };

} catch (error) {
throw new Error(`Calculation failed: ${error.message}`);
}
}

/**

- Validate player data for calculations
- @param {Object} playerData - Player statistical data
- @returns {boolean} True if data is valid
  */
  function validatePlayerData(playerData) {
  const requiredFields = [
  ‘FGA_36’,
  ‘FTA_36’,
  ‘two_point_percentage’,
  ‘three_point_percentage’,
  ‘free_throw_percentage’,
  ‘three_point_attempt_rate’
  ];

return requiredFields.every(field => {
const value = playerData[field];
return value !== undefined && value !== null && !isNaN(value) && value >= 0;
});
}

/**

- Validate game parameters
- @param {Object} gameParams - Game-specific parameters
- @returns {boolean} True if parameters are valid
  */
  function validateGameParams(gameParams) {
  const { projectedMinutes, usageAdjustment } = gameParams;

return (
projectedMinutes > 0 &&
projectedMinutes <= 48 &&
usageAdjustment > 0 &&
usageAdjustment <= 5
);
}

module.exports = {
calculatePaceAdjustment,
calculateProjectedFGA,
calculateProjectedFTA,
calculateTwoPointPoints,
calculateThreePointPoints,
calculateFreeThrowPoints,
calculateTotalProjectedPoints,
validatePlayerData,
validateGameParams
};
