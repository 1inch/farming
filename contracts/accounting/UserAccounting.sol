// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/math/Math.sol";

abstract contract UserAccounting {
    struct UserInfo {
        uint40 farmedPerTokenUpdated;
        uint216 farmedPerTokenStored;
        mapping(address => int256) corrections;
    }

    function _farmed(UserInfo storage info, address farm, address account) internal view returns(uint256) {
        return _farmed(info, account, _balanceOf(farm, account), _farmedPerToken(info, farm));
    }

    function _farmed(UserInfo storage info, address account, uint256 balance, uint256 fpt) internal view returns(uint256) {
        return uint256(int256(balance * fpt) - info.corrections[account]) / 1e18;
    }

    // function _eraseFarmed(UserInfo storage info, address farm, address account) internal {
    //     _eraseFarmed(info, account, _balanceOf(farm, account), _farmedPerToken(info, farm));
    // }

    function _eraseFarmed(UserInfo storage info, address account, uint256 balance, uint256 fpt) internal {
        info.corrections[account] = int256(balance * fpt);
    }

    // function _joinFarm(UserInfo storage info, address farm, address account) internal {
    //     _joinFarm(info, account, _balanceOf(farm, account), _farmedPerToken(info, farm));
    // }

    function _joinFarm(UserInfo storage info, address account, uint256 balance, uint256 fpt) internal {
        info.corrections[account] = int256(balance * fpt) - int256(_farmed(info, account, 0, fpt) * 1e18);
    }

    // function _exitFarm(UserInfo storage info, address farm, address account) internal {
    //     _exitFarm(info, account, _balanceOf(farm, account), _farmedPerToken(info, farm));
    // }

    function _exitFarm(UserInfo storage info, address account, uint256 balance, uint256 fpt) internal {
        info.corrections[account] = -int256(_farmed(info, account, balance, fpt) * 1e18);
    }

    function _farmedPerToken(UserInfo storage info, address farm) internal view returns(uint256) {
        (uint256 upd, uint256 fpt) = (info.farmedPerTokenUpdated, info.farmedPerTokenStored);
        if (block.timestamp != upd) {
            uint256 supply = _totalSupply(farm);
            if (supply > 0) {
                fpt += _farmedSinceCheckpointScaled(farm, upd) / supply;
            }
        }
        return fpt;
    }

    function _userCheckpoint(UserInfo storage info, uint256 fpt) internal {
        (info.farmedPerTokenUpdated, info.farmedPerTokenStored) = (uint40(block.timestamp), uint216(fpt));
    }

    function _beforeBalancesChanged(UserInfo storage info, address farm, address from, address to, uint256 amount, bool inFrom, bool inTo) internal {
        if (amount > 0 && (inFrom || inTo)) {
            _beforeBalancesChanged(info, _farmedPerToken(info, farm), from, to, amount, inFrom, inTo);
        }
    }

    function _beforeBalancesChanged(UserInfo storage info, uint256 fpt, address from, address to, uint256 amount, bool inFrom, bool inTo) internal {
        if (amount > 0 && (inFrom || inTo)) {
            if (inFrom) {
                info.corrections[from] -= int256(amount * fpt);
                if (!inTo) {
                    _userCheckpoint(info, fpt);
                }
            }

            if (inTo) {
                info.corrections[to] += int256(amount * fpt);
                if (!inFrom) {
                    _userCheckpoint(info, fpt);
                }
            }
        }
    }

    function _balanceOf(address farm, address user) internal view virtual returns(uint256);
    function _totalSupply(address farm) internal view virtual returns(uint256);
    function _farmedSinceCheckpointScaled(address farm, uint256 updated) internal view virtual returns(uint256);
}
