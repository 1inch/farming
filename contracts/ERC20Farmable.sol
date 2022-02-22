// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@1inch/solidity-utils/contracts/libraries/AddressSet.sol";

import "./interfaces/IERC20Farmable.sol";
import "./accounting/UserAccounting.sol";
import "./accounting/FarmAccounting.sol";

abstract contract ERC20Farmable is ERC20, IERC20Farmable {
    using AddressArray for AddressArray.Data;
    using AddressSet for AddressSet.Data;
    using UserAccounting for UserAccounting.Info;

    mapping(address => UserAccounting.Info) private _userInfo;
    mapping(address => uint256) private _farmTotalSupply;
    mapping(address => AddressSet.Data) private _userFarms;

    /// @dev Use this method for signaling on bad farms even in static calls (for stats)
    function onError(string memory /* error */) external view {
        require(msg.sender == address(this), "ERC20F: access denied");
    }

    function farmTotalSupply(address farm_) public view virtual returns(uint256) {
        return _farmTotalSupply[farm_];
    }

    function farmBalanceOf(address farm_, address account) public view virtual returns (uint256) {
        return _userFarms[account].contains(farm_) ? balanceOf(account) : 0;
    }

    function userIsFarming(address account, address farm_) public view virtual returns(bool) {
        return _userFarms[account].contains(farm_);
    }

    function userFarmsCount(address account) public view virtual returns(uint256) {
        return _userFarms[account].length();
    }

    function userFarmsAt(address account, uint256 index) public view virtual returns(address) {
        return _userFarms[account].at(index);
    }

    function userFarms(address account) public view virtual returns(address[] memory) {
        return _userFarms[account].items.get();
    }

    function farmedPerToken(address farm_) public view virtual returns(uint256 fpt) {
        return _userInfo[farm_].farmedPerToken(farm_, _lazyGetSupply, _lazyGetFarmed);
    }

    function farmed(address farm_, address account) public view virtual returns(uint256) {
        return _userInfo[farm_].farmed(account, farmBalanceOf(farm_, account), farmedPerToken(farm_));
    }

    function join(address farm_) public virtual returns(uint256) {
        require(farm_ != address(0), "ERC20F: farm is zero");
        require(_userFarms[msg.sender].add(farm_), "ERC20F: already farming");

        uint256 balance = balanceOf(msg.sender);
        _userInfo[farm_].updateBalances(farmedPerToken(farm_), address(0), msg.sender, balance, false, true);
        _farmTotalSupply[farm_] += balance;
        return _userFarms[msg.sender].length();
    }

    function quitAll() public virtual {
        address[] memory farms = _userFarms[msg.sender].items.get();
        for (uint256 i = 0; i < farms.length; i++) {
            quit(farms[i]);
        }
    }

    function quit(address farm_) public virtual returns(uint256) {
        require(farm_ != address(0), "ERC20F: farm is zero");
        require(_userFarms[msg.sender].remove(address(farm_)), "ERC20F: already exited");

        uint256 balance = balanceOf(msg.sender);
        _userInfo[farm_].updateBalances(farmedPerToken(farm_), msg.sender, address(0), balance, true, false);
        _farmTotalSupply[farm_] -= balance;
        return _userFarms[msg.sender].length();
    }

    function claimAll() public virtual returns(uint256[] memory amounts) {
        address[] memory farms = _userFarms[msg.sender].items.get();
        amounts = new uint256[](farms.length);
        for (uint256 i = 0; i < farms.length; i++) {
            amounts[i] = claim(farms[i]);
        }
    }

    function claim(address farm_) public virtual returns(uint256) {
        uint256 fpt = farmedPerToken(farm_);
        uint256 balance = farmBalanceOf(farm_, msg.sender);
        uint256 amount = _userInfo[farm_].farmed(msg.sender, balance, fpt);
        if (amount > 0) {
            _userInfo[farm_].eraseFarmed(msg.sender, balance, fpt);
            IFarm(farm_).claimFor(msg.sender, amount);
        }
        return amount;
    }

    function updateCheckpoint() public virtual {
        _userInfo[msg.sender].updateCheckpoint(farmedPerToken(msg.sender));
    }

    // ERC20 overrides

    function _beforeTokenTransfer(address from, address to, uint256 amount) internal override virtual {
        super._beforeTokenTransfer(from, to, amount);

        if (amount > 0 && from != to) {
            address[] memory a = _userFarms[from].items.get();
            address[] memory b = _userFarms[to].items.get();

            for (uint256 i = 0; i < a.length; i++) {
                address farm_ = a[i];

                uint256 j;
                for (j = 0; j < b.length; j++) {
                    if (farm_ == b[j]) {
                        // Both parties are farming the same token
                        _userInfo[farm_].updateBalances(farmedPerToken(farm_), from, to, amount, true, true);
                        b[j] = address(0);
                        break;
                    }
                }

                if (j == b.length) {
                    // Sender is farming a token, but receiver is not
                    _userInfo[farm_].updateBalances(farmedPerToken(farm_), from, to, amount, true, false);
                    _farmTotalSupply[farm_] -= amount;
                }
            }

            for (uint256 j = 0; j < b.length; j++) {
                address farm_ = b[j];
                if (farm_ != address(0)) {
                    // Receiver is farming a token, but sender is not
                    _userInfo[farm_].updateBalances(farmedPerToken(farm_), from, to, amount, false, true);
                    _farmTotalSupply[farm_] += amount;
                }
            }
        }
    }

    // UserAccounting bindings

    function _lazyGetSupply(address farm_) internal view returns(uint256) {
        return _farmTotalSupply[farm_];
    }

    function _lazyGetFarmed(address farm_, uint256 checkpoint) internal view returns(uint256) {
        try IFarm(farm_).farmedSinceCheckpointScaled{ gas: 200_000 }(checkpoint) returns(uint256 amount) {
            if (amount <= FarmAccounting._MAX_REWARD_AMOUNT * 1e18) {
                return amount;
            }
            else {
                this.onError("farm.farmedSinceCheckpoint() result overflowed");
            }
        }
        catch {
            this.onError("farm.farmedSinceCheckpoint() failed");
        }
        return 0;
    }
}
