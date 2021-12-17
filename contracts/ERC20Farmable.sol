// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@1inch/solidity-utils/contracts/libraries/AddressSet.sol";

import "./interfaces/IERC20Farmable.sol";
import "./UserAccounting.sol";

abstract contract ERC20Farmable is ERC20, IERC20Farmable, UserAccounting {
    using AddressArray for AddressArray.Data;
    using AddressSet for AddressSet.Data;

    event Error(string error);

    mapping(address => UserInfo) public infos;
    mapping(address => uint256) public override farmTotalSupply;
    mapping(address => AddressSet.Data) private _userFarms;

    function _balanceOf(address farm_, address user) internal view override returns(uint256) {
        if (_userFarms[user].contains(farm_)) {
            return balanceOf(user);
        }
        return 0;
    }

    function _totalSupply(address farm_) internal view override returns(uint256) {
        return farmTotalSupply[farm_];
    }

    function _farmedSinceCheckpointScaled(address farm_, uint256 updated) internal view override returns(uint256) {
        try IERC20Farm(farm_).farmedSinceCheckpointScaled(updated) returns(uint256 amount) {
            if (amount <= 1e54) {
                return amount;
            }
            else {
                // emit Error("farm.farmedSinceCheckpoint() result overflowed");
            }
        }
        catch {
            // emit Error("farm.farmedSinceCheckpoint() failed");
        }
        return 0;
    }

    function userFarms(address account) external view returns(address[] memory) {
        return _userFarms[account].items.get();
    }

    function userCorrection(address farm_, address account) external view returns(int256) {
        return infos[farm_].corrections[account];
    }

    function farmed(address farm_, address account) external view returns (uint256) {
        return _farmed(infos[farm_], farm_, account);
    }

    function farmedPerToken(address farm_) external view returns (uint256 fpt) {
        return _farmedPerToken(infos[farm_], farm_);
    }

    function farm(address farm_) external override {
        uint256 fpt = _farmedPerToken(infos[farm_], farm_);
        _checkpoint(farm_, fpt);

        uint256 balance = balanceOf(msg.sender);
        farmTotalSupply[farm_] += balance;
        _joinFarm(infos[farm_], msg.sender, balance, fpt);

        require(_userFarms[msg.sender].add(farm_), "ERC20Farmable: already farming");
    }

    function exit(address farm_) external override {
        uint256 fpt = _farmedPerToken(infos[farm_], farm_);
        _checkpoint(farm_, fpt);

        uint256 balance = balanceOf(msg.sender);
        farmTotalSupply[farm_] -= balance;
        _exitFarm(infos[farm_], msg.sender, balance, fpt);

        require(_userFarms[msg.sender].remove(address(farm_)), "ERC20Farmable: already exited");
    }

    function claim(address farm_) external override {
        uint256 fpt = _farmedPerToken(infos[farm_], farm_);
        uint256 balance = balanceOf(msg.sender);

        uint256 amount = _farmed(infos[farm_], msg.sender, balance, fpt);
        if (amount > 0) {
            _eraseFarmed(infos[farm_], msg.sender, balance, fpt);
            IERC20Farm(farm_).claimFor(msg.sender, amount);
        }
    }

    function checkpoint(address farm_) external override {
        _checkpoint(farm_, _farmedPerToken(infos[farm_], farm_));
    }

    function _checkpoint(address farm_, uint256 fpt) internal {
        super._checkpoint(infos[farm_], fpt);

        try IERC20Farm(farm_).farmingCheckpoint() {}
        catch {
            emit Error("farm.farmingCheckpoint() failed");
        }
    }

    function _beforeTokenTransfer(address from, address to, uint256 amount) internal override {
        if (amount > 0) {
            address[] memory a = _userFarms[from].items.get();
            address[] memory b = _userFarms[to].items.get();

            for (uint256 i = 0; i < a.length; i++) {
                address farm_ = a[i];

                uint256 j;
                for (j = 0; j < b.length; j++) {
                    if (farm_ == b[j]) {
                        // Both parties are farming the same token
                        _beforeBalancesChanged(infos[farm_], farm_, from, to, amount, true, true);
                        b[j] = address(0);
                        break;
                    }
                }

                if (j == b.length) {
                    // Sender is farming a token, but receiver is not
                    _beforeBalancesChanged(infos[farm_], farm_, from, to, amount, true, false);
                    farmTotalSupply[farm_] -= amount;
                }
            }

            for (uint256 j = 0; j < b.length; j++) {
                address farm_ = b[j];
                if (farm_ != address(0)) {
                    // Receiver is farming a token, but sender is not
                    _beforeBalancesChanged(infos[farm_], farm_, from, to, amount, false, true);
                    farmTotalSupply[farm_] += amount;
                }
            }
        }
    }
}
