// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/math/Math.sol";

library UserAccounting {
    struct UserInfo {
        uint40 farmedPerTokenUpdated;
        uint216 farmedPerTokenStored;
        mapping(address => int256) corrections;
    }

    function farmedPerToken(
        UserInfo storage info,
        address farm,
        function(address) internal view returns(uint256) getSupply,
        function(address, uint256) internal view returns(uint256) getFarmedSinceCheckpointScaled
    ) internal view returns(uint256) {
        (uint256 upd, uint256 fpt) = (info.farmedPerTokenUpdated, info.farmedPerTokenStored);
        if (block.timestamp != upd) {
            uint256 supply = getSupply(farm);
            if (supply > 0) {
                fpt += getFarmedSinceCheckpointScaled(farm, upd) / supply;
            }
        }
        return fpt;
    }

    function farmed(UserInfo storage info, address account, uint256 balance, uint256 fpt) internal view returns(uint256) {
        return uint256(int256(balance * fpt) - info.corrections[account]) / 1e18;
    }

    function eraseFarmed(UserInfo storage info, address account, uint256 balance, uint256 fpt) internal {
        info.corrections[account] = int256(balance * fpt);
    }

    function userCheckpoint(UserInfo storage info, uint256 fpt) internal {
        (info.farmedPerTokenUpdated, info.farmedPerTokenStored) = (uint40(block.timestamp), uint216(fpt));
    }

    function beforeBalancesChanged(UserInfo storage info, uint256 fpt, address from, address to, uint256 amount, bool inFrom, bool inTo) internal {
        if (amount > 0 && (inFrom || inTo)) {
            if (!inFrom || !inTo) {
                userCheckpoint(info, fpt);
            }
            if (inFrom) {
                info.corrections[from] -= int256(amount * fpt);
            }
            if (inTo) {
                info.corrections[to] += int256(amount * fpt);
            }
        }
    }
}
