// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./accounting/FarmAccounting.sol";
import "./accounting/UserAccounting.sol";

library FarmingLib {
    using FarmAccounting for FarmAccounting.Info;
    using UserAccounting for UserAccounting.Info;
    using FarmingLib for FarmingLib.Info;

    struct Data {
        FarmAccounting.Info farmInfo;
        UserAccounting.Info userInfo;
    }

    struct Info {
        function() internal view returns(uint256) getTotalSupply;
        bytes32 dataSlot;
    }

    function makeInfo(function() internal view returns(uint256) getTotalSupply, Data storage data) internal pure returns(Info memory info) {
        info.getTotalSupply = getTotalSupply;
        bytes32 dataSlot;
        assembly {  // solhint-disable-line no-inline-assembly
            dataSlot := data.slot
        }
        info.dataSlot = dataSlot;
    }

    function getData(Info memory self) internal pure returns(Data storage data) {
        bytes32 dataSlot = self.dataSlot;
        assembly {  // solhint-disable-line no-inline-assembly
            data.slot := dataSlot
        }
    }

    function startFarming(Info memory self, uint256 amount, uint256 period) internal returns(uint256 reward) {
        Data storage data = self.getData();
        data.userInfo.updateFarmedPerToken(_farmedPerToken(self));
        reward = data.farmInfo.startFarming(amount, period);
    }

    function farmed(Info memory self, address account, uint256 balance) internal view returns(uint256) {
        return self.getData().userInfo.farmed(account, balance, _farmedPerToken(self));
    }

    function claim(Info memory self, address account, uint256 balance) internal returns(uint256 amount) {
        Data storage data = self.getData();
        uint256 fpt = _farmedPerToken(self);
        amount = data.userInfo.farmed(account, balance, fpt);
        if (amount > 0) {
            data.userInfo.eraseFarmed(account, balance, fpt);
        }
    }

    function updateBalances(Info memory self, address from, address to, uint256 amount) internal {
        self.getData().userInfo.updateBalances(from, to, amount, _farmedPerToken(self));
    }

    function _farmedPerToken(Info memory self) private view returns (uint256) {
        return self.getData().userInfo.farmedPerToken(_infoToContext(self), _lazyGetSupply, _lazyGetFarmed);
    }

    // UserAccounting bindings

    function _lazyGetSupply(bytes32 context) private view returns(uint256) {
        Info memory self = _contextToInfo(context);
        return self.getTotalSupply();
    }

    function _lazyGetFarmed(bytes32 context, uint256 checkpoint) private view returns(uint256) {
        Info memory self = _contextToInfo(context);
        return self.getData().farmInfo.farmedSinceCheckpointScaled(checkpoint);
    }

    function _contextToInfo(bytes32 context) private pure returns(Info memory self) {
        assembly {  // solhint-disable-line no-inline-assembly
            self := context
        }
    }

    function _infoToContext(Info memory self) private pure returns(bytes32 context) {
        assembly {  // solhint-disable-line no-inline-assembly
            context := self
        }
    }
}
