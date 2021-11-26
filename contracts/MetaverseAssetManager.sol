// SPDX-License-Identifier: GPL-3.0-or-later
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

import "./RewardsAssetManager.sol";

pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

contract MetaverseAssetManager is RewardsAssetManager {

    constructor(
        IVault vault,
        IERC20 token
    ) RewardsAssetManager(vault, bytes32(0), token) {

    }

    /**
     * @dev Should be called in same transaction as deployment through a factory contract
     * @param poolId - the id of the pool
     * @param rewardsDistributor - the address of the rewards contract (to distribute stkToken)
     */
    function initialize(bytes32 poolId, address rewardsDistributor) public {
        _initialize(poolId);
        // stkToken.approve(rewardsDistributor, type(uint256).max);
    }

    /**
     * @dev Deposits capital into somewhere
     * @param amount - the amount of tokens being deposited
     * @return the amount deposited
     */
    function _invest(uint256 amount, uint256) internal override returns (uint256) {
        return amount;
    }

    /**
     * @dev Withdraws capital out of somewhere
     * @param amount - the amount to withdraw
     * @return the number of tokens to return to the vault
     */
    function _divest(uint256 amount, uint256) internal override returns (uint256) {
        return amount;
    }

    /**
     * @dev Checks lpToken balance
     */
    function _getAUM() internal view override returns (uint256) {
        // return lpToken.balanceOf(address(this));
    }

    function claimRewards() public {
         // Claim stokToken from pool
    }
}