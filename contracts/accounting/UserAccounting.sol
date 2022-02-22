// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

library UserAccounting {
    struct Info {
        uint40 checkpoint;
        uint216 farmedPerTokenStored;
        mapping(address => int256) corrections;
    }

    function farmedPerToken(
        Info storage info,
        address context,
        function(address) internal view returns(uint256) lazyGetSupply,
        function(address, uint256) internal view returns(uint256) lazyGetFarmed
    ) internal view returns(uint256) {
        (uint256 checkpoint, uint256 fpt) = (info.checkpoint, info.farmedPerTokenStored);
        if (block.timestamp != checkpoint) {
            uint256 supply = lazyGetSupply(context);
            if (supply > 0) {
                fpt += lazyGetFarmed(context, checkpoint) / supply;
            }
        }
        return fpt;
    }

    function farmed(Info storage info, address account, uint256 balance, uint256 fpt) internal view returns(uint256) {
        return uint256(int256(balance * fpt) - info.corrections[account]) / 1e18;
    }

    function eraseFarmed(Info storage info, address account, uint256 balance, uint256 fpt) internal {
        info.corrections[account] = int256(balance * fpt);
    }

    function updateCheckpoint(Info storage info, uint256 fpt) internal {
        (info.checkpoint, info.farmedPerTokenStored) = (uint40(block.timestamp), uint216(fpt));
    }

    function updateBalances(Info storage info, uint256 fpt, address from, address to, uint256 amount, bool inFrom, bool inTo) internal {
        if (amount > 0 && (inFrom || inTo)) {
            if (inFrom != inTo) {
                updateCheckpoint(info, fpt);
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
