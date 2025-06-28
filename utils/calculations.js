/**
 * @fileoverview NBA Player Projection Calculation Utilities
 * Contains core mathematical functions for projecting player performance
 * based on player stats, game parameters, and adjustment factors.
 */

/**
 * Calculates a pace adjustment factor for offensive and defensive statistics.
 * If data is missing or invalid, a default of 1.0 (no adjustment) is returned.
 * @param {number} opponentPace - Opponent team’s pace (e.g., from nba_team_pace_2024_25.json)
 * @param {number} leagueAvgPace - League average pace (e.g., from nba_team_pace_2024_25.json)
 * @returns {number} Pace adjustment multiplier. Returns 1.0 if inputs are invalid or zero.
 */
function calculatePaceAdjustment(opponentPace, leagueAvgPace) {
  // Ensure inputs are valid numbers and leagueAvgPace is not zero
  if (typeof opponentPace !== 'number' || typeof leagueAvgPace !== 'number' ||
      !isFinite(opponentPace) || !isFinite(leagueAvgPace) || leagueAvgPace === 0) {
    console.warn("Invalid pace data for calculation. Returning default pace adjustment of 1.0.",
                 { opponentPace, leagueAvgPace });
    return 1.0;
  }
  return opponentPace / leagueAvgPace;
}

/**
 * Calculates projected field goal attempts for a player in a given game.
 * @param {number} fga36 - Player's field goal attempts per 36 minutes.
 * @param {number} projectedMinutes - Player's projected minutes for the game.
 * @param {number} usageAdjustment - Adjustment factor for player's usage (e.g., 1.0 for normal, 1.2 for 20% increase).
 * @param {number} dvpFactor - Defense vs. Position factor for Field Goal Attempts (adjusts based on opponent's defense against position).
 * @param {number} paceAdjustment - Overall game pace adjustment factor.
 * @returns {number} Projected field goal attempts.
 */
function calculateProjectedFGA(fga36, projectedMinutes, usageAdjustment, dvpFactor, paceAdjustment) {
  // All inputs are expected to be numbers at this point due to upstream validation
  return fga36 * (projectedMinutes / 36) * usageAdjustment * dvpFactor * paceAdjustment;
}

/**
 * Calculates projected free throw attempts for a player in a given game.
 * @param {number} fta36 - Player's free throw attempts per 36 minutes.
 * @param {number} projectedMinutes - Player's projected minutes for the game.
 * @param {number} usageAdjustment - Adjustment factor for player's usage.
 * @param {number} dvpFactor - Defense vs. Position factor for Free Throw Attempts.
 * @param {number} paceAdjustment - Overall game pace adjustment factor.
 * @returns {number} Projected free throw attempts.
 */
function calculateProjectedFTA(fta36, projectedMinutes, usageAdjustment, dvpFactor, paceAdjustment) {
  // All inputs are expected to be numbers at this point due to upstream validation
  return fta36 * (projectedMinutes / 36) * usageAdjustment * dvpFactor * paceAdjustment;
}

/**
 * Calculates projected points derived from two-point field goals.
 * @param {number} projectedFGA - Total projected field goal attempts.
 * @param {number} threePointAttemptRate - Player's rate of 3PA out of total FGA (0.0 to 1.0).
 * @param {number} twoPointPercentage - Player's two-point field goal percentage (0.0 to 1.0).
 * @returns {number} Projected points from two-point field goals.
 */
function calculateTwoPointPoints(projectedFGA, threePointAttemptRate, twoPointPercentage) {
  const twoPointAttempts = projectedFGA * (1 - threePointAttemptRate);
  return twoPointAttempts * twoPointPercentage * 2;
}

/**
 * Calculates projected points derived from three-point field goals.
 * @param {number} projectedFGA - Total projected field goal attempts.
 * @param {number} threePointAttemptRate - Player's rate of 3PA out of total FGA (0.0 to 1.0).
 * @param {number} threePointPercentage - Player's three-point field goal percentage (0.0 to 1.0).
 * @returns {number} Projected points from three-point field goals.
 */
function calculateThreePointPoints(projectedFGA, threePointAttemptRate, threePointPercentage) {
  const threePointAttempts = projectedFGA * threePointAttemptRate;
  return threePointAttempts * threePointPercentage * 3;
}

/**
 * Calculates projected points derived from free throws.
 * @param {number} projectedFTA - Projected free throw attempts.
 * @param {number} freeThrowPercentage - Player's free throw percentage (0.0 to 1.0).
 * @returns {number} Projected points from free throws.
 */
function calculateFreeThrowPoints(projectedFTA, freeThrowPercentage) {
  return projectedFTA * freeThrowPercentage;
}

/**
 * Validates a single numerical field.
 * @param {any} value - The value to validate.
 * @param {string} fieldName - The name of the field for error messages.
 * @param {boolean} [allowZero=false] - Whether a value of 0 is considered valid.
 * @returns {number} The validated and parsed number.
 * @throws {Error} If the value is not a valid number or fails validation rules.
 */
function validateAndParseNumber(value, fieldName, allowZero = false) {
  const parsedValue = parseFloat(value);

  if (isNaN(parsedValue)) {
    throw new Error(`${fieldName} is not a valid number. Received: "${value}"`);
  }
  if (!isFinite(parsedValue)) {
      throw new Error(`${fieldName} is infinite or too large/small. Received: "${value}"`);
  }
  if (!allowZero && parsedValue <= 0) {
    throw new Error(`${fieldName} must be greater than 0. Received: "${value}"`);
  }
  if (parsedValue < 0) {
      throw new Error(`${fieldName} cannot be negative. Received: "${value}"`);
  }
  return parsedValue;
}

/**
 * Main function to calculate total projected points for an NBA player.
 * This function handles input parsing and validation.
 *
 * @param {Object} playerData - Player statistical data (e.g., from nba_player_stats_2024_25.json).
 * Expected fields: FGA_36, FTA_36, two_point_percentage, three_point_percentage,
 * free_throw_percentage, three_point_attempt_rate.
 * @param {Object} rawGameParams - Game-specific parameters directly from UI inputs (strings possible).
 * Expected fields: projectedMinutes (string), usageAdjustment (string).
 * @param {Object} adjustments - Various adjustment factors, assumed to be pre-calculated numbers.
 * Expected fields: paceAdjustment, dvpFgaFactor, dvpFtaFactor.
 * @returns {Object} Complete projection with breakdown of points and attempts.
 * @throws {Error} If any input data is missing, invalid, or cannot be parsed.
 */
function calculateTotalProjectedPoints(playerData, rawGameParams, adjustments) {
  try {
    // --- STEP 1: Validate and Parse Raw Game Parameters from UI ---
    // This is where we handle the string-to-number conversion and validation
    const projectedMinutes = validateAndParseNumber(rawGameParams.projectedMinutes, 'Projected Minutes');
    // usageAdjustment can be 0.x, so allowZero is false (still must be > 0)
    const usageAdjustment = validateAndParseNumber(rawGameParams.usageAdjustment, 'Usage Adjustment');

    // Additional validation for game parameters
    if (projectedMinutes > 48) {
      throw new Error('Projected Minutes cannot exceed 48.');
    }
    // usageAdjustment can be outside 0-5 range, but this is a common validation. Adjust if needed.
    if (usageAdjustment > 5) {
      throw new Error('Usage Adjustment cannot exceed 5.0.');
    }

    // --- STEP 2: Extract Player Data and Validate Player Data ---
    const {
      FGA_36,
      FTA_36,
      two_point_percentage,
      three_point_percentage,
      free_throw_percentage,
      three_point_attempt_rate
    } = playerData;

    // Use a helper function to validate essential player stats
    if (!validatePlayerData({
        FGA_36, FTA_36, two_point_percentage,
        three_point_percentage, free_throw_percentage, three_point_attempt_rate
    })) {
      throw new Error('Missing or invalid core player statistics required for calculation.');
    }

    // --- STEP 3: Extract Adjustment Factors ---
    const { paceAdjustment, dvpFgaFactor, dvpFtaFactor } = adjustments;

    // Basic validation for adjustment factors (assuming they come pre-calculated and are numbers)
    if (typeof paceAdjustment !== 'number' || !isFinite(paceAdjustment) || paceAdjustment <= 0 ||
        typeof dvpFgaFactor !== 'number' || !isFinite(dvpFgaFactor) || dvpFgaFactor <= 0 ||
        typeof dvpFtaFactor !== 'number' || !isFinite(dvpFtaFactor) || dvpFtaFactor <= 0) {
        throw new Error('Invalid or missing adjustment factors.');
    }

    // --- STEP 4: Perform Calculations ---
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

    const totalProjectedPoints = twoPointPoints + threePointPoints + freeThrowPoints;

    // --- STEP 5: Return Rounded Results for Display ---
    return {
      projectedPoints: parseFloat(totalProjectedPoints.toFixed(1)), // Round to 1 decimal for display
      breakdown: {
        twoPointers: parseFloat(twoPointPoints.toFixed(1)),
        threePointers: parseFloat(threePointPoints.toFixed(1)),
        freeThrows: parseFloat(freeThrowPoints.toFixed(1)),
        projectedFGA: parseFloat(projectedFGA.toFixed(1)),
        projectedFTA: parseFloat(projectedFTA.toFixed(1)),
        paceAdjustment: parseFloat(paceAdjustment.toFixed(2)) // Pace usually 2 decimals
      },
      attempts: {
        twoPointAttempts: parseFloat((projectedFGA * (1 - three_point_attempt_rate)).toFixed(1)),
        threePointAttempts: parseFloat((projectedFGA * three_point_attempt_rate).toFixed(1)),
        freeThrowAttempts: parseFloat(projectedFTA.toFixed(1))
      }
    };

  } catch (error) {
    // Re-throw with a consistent prefix for easier debugging at a higher level
    throw new Error(`Calculation failed: ${error.message}`);
  }
}

/**
 * Validates essential player statistical data fields.
 * Ensures fields are present, are numbers, not NaN, and non-negative.
 * @param {Object} playerData - Player statistical data object.
 * @returns {boolean} True if all required fields are valid; otherwise, false.
 */
function validatePlayerData(playerData) {
  const requiredFields = [
    'FGA_36',
    'FTA_36',
    'two_point_percentage',
    'three_point_percentage',
    'free_throw_percentage',
    'three_point_attempt_rate'
  ];

  return requiredFields.every(field => {
    const value = playerData[field];
    return typeof value === 'number' && !isNaN(value) && value >= 0;
  });
}

// Export functions for use in other modules
module.exports = {
  calculatePaceAdjustment,
  calculateProjectedFGA,
  calculateProjectedFTA,
  calculateTwoPointPoints,
  calculateThreePointPoints,
  calculateFreeThrowPoints,
  calculateTotalProjectedPoints,
  validatePlayerData // Still useful for initial data checks outside main calculation
};
