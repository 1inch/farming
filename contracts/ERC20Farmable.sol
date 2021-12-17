// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@1inch/solidity-utils/contracts/libraries/AddressSet.sol";

import "./interfaces/IERC20Farmable.sol";
import "./accounting/UserAccounting.sol";

abstract contract ERC20Farmable is IERC20Farmable, ERC20 {
    using AddressArray for AddressArray.Data;
    using AddressSet for AddressSet.Data;
    using UserAccounting for UserAccounting.Info;

    event Error(string error);

    mapping(address => UserAccounting.Info) public infos;
    mapping(address => uint256) public override farmTotalSupply;
    mapping(address => AddressSet.Data) private _userFarms;

    function userFarms(address account) external view returns(address[] memory) {
        return _userFarms[account].items.get();
    }

    function farmedPerToken(address farm_) public view returns (uint256 fpt) {
        return infos[farm_].farmedPerToken(farm_, _getTotalSupply, _getFarmedSinceCheckpointScaled);
    }

    function farmed(address farm_, address account) external view returns (uint256) {
        uint256 balance = _userFarms[account].contains(farm_) ? balanceOf(account) : 0;
        return infos[farm_].farmed(account, balance, farmedPerToken(farm_));
    }

    function farm(address farm_) external override {
        require(_userFarms[msg.sender].add(farm_), "ERC20Farmable: already farming");

        uint256 balance = balanceOf(msg.sender);
        infos[farm_].updateBalances(farmedPerToken(farm_), address(0), msg.sender, balance, false, true);
        farmTotalSupply[farm_] += balance;
    }

    function exit(address farm_) external override {
        require(_userFarms[msg.sender].remove(address(farm_)), "ERC20Farmable: already exited");

        uint256 balance = balanceOf(msg.sender);
        infos[farm_].updateBalances(farmedPerToken(farm_), msg.sender, address(0), balance, true, false);
        farmTotalSupply[farm_] -= balance;
    }

    function claim(address farm_) external override {
        uint256 fpt = farmedPerToken(farm_);
        uint256 balance = balanceOf(msg.sender);
        uint256 amount = infos[farm_].farmed(msg.sender, balance, fpt);
        if (amount > 0) {
            infos[farm_].eraseFarmed(msg.sender, balance, fpt);
            IFarm(farm_).claimFor(msg.sender, amount);
        }
    }

    function checkpoint(address farm_) external override {
        infos[farm_].checkpoint(farmedPerToken(farm_));
        try IFarm(farm_).farmingCheckpoint() {}
        catch {
            emit Error("farm.farmingCheckpoint() failed");
        }
    }

    // ERC20 overrides

    function _beforeTokenTransfer(address from, address to, uint256 amount) internal override {
        super._beforeTokenTransfer(from, to, amount);

        if (amount > 0) {
            address[] memory a = _userFarms[from].items.get();
            address[] memory b = _userFarms[to].items.get();

            for (uint256 i = 0; i < a.length; i++) {
                address farm_ = a[i];

                uint256 j;
                for (j = 0; j < b.length; j++) {
                    if (farm_ == b[j]) {
                        // Both parties are farming the same token
                        infos[farm_].updateBalances(farmedPerToken(farm_), from, to, amount, true, true);
                        b[j] = address(0);
                        break;
                    }
                }

                if (j == b.length) {
                    // Sender is farming a token, but receiver is not
                    infos[farm_].updateBalances(farmedPerToken(farm_), from, to, amount, true, false);
                    farmTotalSupply[farm_] -= amount;
                }
            }

            for (uint256 j = 0; j < b.length; j++) {
                address farm_ = b[j];
                if (farm_ != address(0)) {
                    // Receiver is farming a token, but sender is not
                    infos[farm_].updateBalances(farmedPerToken(farm_), from, to, amount, false, true);
                    farmTotalSupply[farm_] += amount;
                }
            }
        }
    }

    // UserAccounting bindings

    function _getTotalSupply(address farm_) internal view returns(uint256) {
        return farmTotalSupply[farm_];
    }

    function _getFarmedSinceCheckpointScaled(address farm_, uint256 updated) internal view returns(uint256) {
        try IFarm(farm_).farmedSinceCheckpointScaled(updated) returns(uint256 amount) {
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
}
