// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./accounting/FarmAccounting.sol";
import "./accounting/UserAccounting.sol";

library FarmingLib {
    using FarmAccounting for FarmAccounting.Info;
    using UserAccounting for UserAccounting.Info;

    event RewardAdded(uint256 reward, uint256 duration);

    struct Data {
        uint256 totalSupply;
        FarmAccounting.Info farmInfo;
        UserAccounting.Info userInfo;
    }

    function startFarming(Data storage self, uint256 amount, uint256 period) internal {
        self.userInfo.updateFarmedPerToken(_farmedPerToken(self));
        uint256 reward = self.farmInfo.startFarming(amount, period);
        emit RewardAdded(reward, period);
    }

    function farmed(Data storage self, address account, uint256 balance) internal view returns(uint256) {
        return self.userInfo.farmed(account, balance, _farmedPerToken(self));
    }

    function claim(Data storage self, address account, uint256 balance) internal returns(uint256 amount) {
        uint256 fpt = _farmedPerToken(self);
        amount = self.userInfo.farmed(account, balance, fpt);
        if (amount > 0) {
            self.userInfo.eraseFarmed(account, balance, fpt);
        }
    }

    function updateBalances(Data storage self, address from, address to, uint256 amount) internal {
        self.userInfo.updateBalances(from, to, amount, _farmedPerToken(self));
        if (from == address(0)) {
            self.totalSupply += amount;
        }
        if (to == address(0)) {
            self.totalSupply -= amount;
        }
    }

    function _farmedPerToken(Data storage self) private view returns (uint256) {
        return self.userInfo.farmedPerToken(_dataPtrToContext(self), _lazyGetSupply, _lazyGetFarmed);
    }

    // UserAccounting bindings

    function _lazyGetSupply(bytes32 context) private view returns(uint256) {
        return _contextToDataPtr(context).totalSupply;
    }

    function _lazyGetFarmed(bytes32 context, uint256 checkpoint) private view returns(uint256) {
        return _contextToDataPtr(context).farmInfo.farmedSinceCheckpointScaled(checkpoint);
    }

    function _contextToDataPtr(bytes32 context) private pure returns(Data storage self) {
        assembly {  // solhint-disable-line no-inline-assembly
            self.slot := context
        }
    }

    function _dataPtrToContext(Data storage self) private pure returns(bytes32 context) {
        assembly {  // solhint-disable-line no-inline-assembly
            context := self.slot
        }
    }
}
