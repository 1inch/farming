// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@1inch/solidity-utils/contracts/libraries/AddressSet.sol";

import "./interfaces/IERC20Farmable.sol";

abstract contract ERC20Farmable is ERC20, IERC20Farmable {
    using AddressArray for AddressArray.Data;
    using AddressSet for AddressSet.Data;

    event Error(string error);

    mapping(IERC20Farm => FarmingData) public farming;
    mapping(IERC20Farm => uint256) public override farmTotalSupply;
    mapping(IERC20Farm => mapping(address => int256)) public override userCorrection;
    mapping(address => AddressSet.Data) private _userFarms;

    function userFarms(address account) external view returns(address[] memory) {
        return _userFarms[account].items.get();
    }

    function farmedPerToken(IERC20Farm farm_) public view returns (uint256 fpt) {
        FarmingData memory fd = farming[farm_];
        uint256 upd = fd.updated;
        fpt = fd.perToken;
        if (block.timestamp != upd) {
            uint256 supply = farmTotalSupply[farm_];
            if (supply > 0) {
                try farm_.farmedSinceCheckpoint(upd) returns(uint256 amount) {
                    if (amount <= 1e36) {
                        fpt += amount / supply;
                    }
                    else {  // solhint-disable-line no-empty-blocks
                        // emit Error("farm.farmedSinceCheckpoint() result overflowed");
                    }
                }
                catch {  // solhint-disable-line no-empty-blocks
                    // emit Error("farm.farmedSinceCheckpoint() failed");
                }
            }
        }
    }

    function farmed(IERC20Farm farm_, address account) external view returns (uint256) {
        return _farmed(farm_, account, balanceOf(account), farmedPerToken(farm_));
    }

    function _farmed(IERC20Farm farm_, address account, uint256 balance, uint256 fpt) private view returns (uint256 ret) {
        if (_userFarms[account].contains(address(farm_))) {
            return uint256(int256(balance * fpt) - userCorrection[farm_][account]) / 1e18;
        }
        return uint256(userCorrection[farm_][account]);
    }

    function farm(IERC20Farm farm_) external override {
        uint256 fpt = farmedPerToken(farm_);
        _update(farm_, fpt);

        uint256 balance = balanceOf(msg.sender);
        farmTotalSupply[farm_] += balance;
        userCorrection[farm_][msg.sender] = userCorrection[farm_][msg.sender] * 1e18 + int256(balance * fpt);
        require(_userFarms[msg.sender].add(address(farm_)), "ERC20Farmable: already farming");
    }

    function exit(IERC20Farm farm_) external override {
        uint256 fpt = farmedPerToken(farm_);
        _update(farm_, fpt);

        uint256 balance = balanceOf(msg.sender);
        farmTotalSupply[farm_] -= balance;
        userCorrection[farm_][msg.sender] = int256(_farmed(farm_, msg.sender, balance, fpt));
        require(_userFarms[msg.sender].remove(address(farm_)), "ERC20Farmable: already exited");
    }

    function claim(IERC20Farm farm_) external override {
        uint256 fpt = farmedPerToken(farm_);
        uint256 balance = balanceOf(msg.sender);


        try farm_.claimFor(msg.sender, _farmed(farm_, msg.sender, balance, fpt)) {
            if (_userFarms[msg.sender].contains(address(farm_))) {
                userCorrection[farm_][msg.sender] = -int256(balance * fpt);
            }
            else {
                userCorrection[farm_][msg.sender] = 0;
            }
        }
        catch {
            emit Error("farm.claimFor() failed");
        }
    }

    function update(IERC20Farm farm_) external override {
        _update(farm_, farmedPerToken(farm_));
    }

    function _update(IERC20Farm farm_, uint256 fpt) internal {
        farming[farm_] = FarmingData({
            updated: uint40(block.timestamp),
            perToken: uint216(fpt)
        });

        try farm_.farmingCheckpoint() {}  // solhint-disable-line no-empty-blocks
        catch {
            emit Error("farm.farmingCheckpoint() failed");
        }
    }

    function _beforeTokenTransfer(address from, address to, uint256 amount) internal override {
        if (amount > 0) {
            address[] memory farms = _userFarms[from].items.get();
            for (uint256 i = 0; i < farms.length; i++) {
                IERC20Farm farm_ = IERC20Farm(farms[i]);
                _beforeTokenTransferForFarm(farm_, from, to, amount, farmedPerToken(farm_), true, _userFarms[to].contains(address(farm_)));
            }

            farms = _userFarms[to].items.get();
            for (uint256 i = 0; i < farms.length; i++) {
                IERC20Farm farm_ = IERC20Farm(farms[i]);
                _beforeTokenTransferForFarm(farm_, from, to, amount, farmedPerToken(farm_), _userFarms[from].contains(address(farm_)), true);
            }
        }
    }

    function _beforeTokenTransferForFarm(IERC20Farm farm_, address from, address to, uint256 amount, uint256 fpt, bool inFrom, bool inTo) internal {
        if (inFrom) {
            userCorrection[farm_][from] -= int256(amount * fpt);
            if (!inTo) {
                _update(farm_, fpt);
                farmTotalSupply[farm_] -= amount;
            }
        }

        if (inTo) {
            userCorrection[farm_][to] += int256(amount * fpt);
            if (!inFrom) {
                _update(farm_, fpt);
                farmTotalSupply[farm_] += amount;
            }
        }
    }
}
