// SPDX-License-Identifier: MIT

pragma solidity ^0.8.11;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@1inch/solidity-utils/contracts/libraries/AddressSet.sol";

import "./interfaces/IERC20Farmable.sol";
import "./accounting/UserAccounting.sol";
import "./accounting/FarmAccounting.sol";

error AccessDenied();
error MaxUserFarmsReached();
error FarmZeroAddress();
error AlreadyFarming();
error AlreadyExited();

abstract contract ERC20Farmable is ERC20, IERC20Farmable {
    using AddressArray for AddressArray.Data;
    using AddressSet for AddressSet.Data;
    using UserAccounting for UserAccounting.Info;

    uint256 public immutable maxUserFarms;

    mapping(address => UserAccounting.Info) private _userInfo;
    mapping(address => uint256) private _farmTotalSupply;
    mapping(address => AddressSet.Data) private _userFarms;

    constructor(uint256 maxUserFarms_) {
        maxUserFarms = maxUserFarms_;
    }

    /// @dev Use this method for signaling on bad farms even in static calls (for stats)
    function onError(string memory /* error */) external view {
        if (msg.sender != address(this)) revert AccessDenied();
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
        if (_userFarms[msg.sender].length() >= maxUserFarms) revert MaxUserFarmsReached();
        if (farm_ == address(0)) revert FarmZeroAddress();
        if (!_userFarms[msg.sender].add(farm_)) revert AlreadyFarming();

        uint256 balance = balanceOf(msg.sender);
        _userInfo[farm_].updateBalances(farmedPerToken(farm_), address(0), msg.sender, balance, false, true);
        _farmTotalSupply[farm_] += balance;
        emit Join(msg.sender, farm_);
        return _userFarms[msg.sender].length();
    }

    function quitAll() public virtual {
        address[] memory farms = _userFarms[msg.sender].items.get();
        for (uint256 i = 0; i < farms.length; i++) {
            quit(farms[i]);
        }
    }

    function quit(address farm_) public virtual returns(uint256) {
        if (farm_ == address(0)) revert FarmZeroAddress();
        if (!_userFarms[msg.sender].remove(address(farm_))) revert AlreadyExited();

        uint256 balance = balanceOf(msg.sender);
        _userInfo[farm_].updateBalances(farmedPerToken(farm_), msg.sender, address(0), balance, true, false);
        _farmTotalSupply[farm_] -= balance;
        emit Quit(msg.sender, farm_);
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

    function _lazyGetSupply(address farm_) private view returns(uint256) {
        return _farmTotalSupply[farm_];
    }

    function _lazyGetFarmed(address farm_, uint256 checkpoint) private view returns(uint256) {
        (bool success, uint256 amount) = _safeStaticCallReturnsUint256(farm_, abi.encodeCall(IFarm(farm_).farmedSinceCheckpointScaled, (checkpoint)), 200_000);
        if (success) {
            if (amount <= FarmAccounting._MAX_REWARD_AMOUNT * FarmAccounting._SCALE) {
                return amount;
            }
            else {
                this.onError("farm.farmedSinceCheckpoint() result overflowed");
            }
        } else {
            this.onError("farm.farmedSinceCheckpoint() failed");
        }
        return 0;
    }

    function _safeStaticCallReturnsUint256(address to, bytes memory data, uint256 gasLimit) private view returns(bool success, uint256 result) {
        assembly {  // solhint-disable-line no-inline-assembly
            success := staticcall(gasLimit, to, add(data, 0x20), mload(data), 0, 0x20)
            success := and(success, eq(returndatasize(), 0x20))
            result := mload(0)
        }
    }
}
