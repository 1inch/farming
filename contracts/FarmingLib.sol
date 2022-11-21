// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./accounting/FarmAccounting.sol";
import "./accounting/UserAccounting.sol";

library FarmingLib {
    using FarmAccounting for FarmAccounting.Info;
    using UserAccounting for UserAccounting.Info;
    using FarmingLib for FarmingLib.DataPtr;
    using FarmingLib for FarmingLib.Info;

    struct Data {
        FarmAccounting.Info farmInfo;
        UserAccounting.Info userInfo;
    }

    type DataPtr is uint256;

    struct Info {
        function() internal view returns(uint256) getTotalSupply;
        DataPtr ptr;
    }

    function makeInfo(function() internal view returns(uint256) getTotalSupply, Data storage data) internal pure returns(Info memory info) {
        info.getTotalSupply = getTotalSupply;
        DataPtr ptr;
        assembly {  // solhint-disable-line no-inline-assembly
            ptr := data.slot
        }
        info.ptr = ptr;
    }

    function get(DataPtr ptr) internal pure returns(Data storage data) {
        assembly {  // solhint-disable-line no-inline-assembly
            data.slot := ptr
        }
    }

    function startFarming(Info memory self, uint256 amount, uint256 period) internal returns(uint256 reward) {
        Data storage data = self.ptr.get();
        data.userInfo.updateFarmedPerToken(_farmedPerToken(self));
        reward = data.farmInfo.startFarming(amount, period);
    }

    function farmed(Info memory self, address account, uint256 balance) internal view returns(uint256) {
        return self.ptr.get().userInfo.farmed(account, balance, _farmedPerToken(self));
    }

    function claim(Info memory self, address account, uint256 balance) internal returns(uint256 amount) {
        uint256 fpt = _farmedPerToken(self);
        amount = self.ptr.get().userInfo.farmed(account, balance, fpt);
        if (amount > 0) {
            self.ptr.get().userInfo.eraseFarmed(account, balance, fpt);
        }
    }

    function updateBalances(Info memory self, address from, address to, uint256 amount) internal {
        self.ptr.get().userInfo.updateBalances(from, to, amount, _farmedPerToken(self));

    }

    function _farmedPerToken(Info memory self) private view returns (uint256) {
        return self.ptr.get().userInfo.farmedPerToken(_infoToContext(self), _lazyGetSupply, _lazyGetFarmed);
    }

    // UserAccounting bindings

    function _lazyGetSupply(bytes32 context) private view returns(uint256) {
        return _contextToInfo(context).getTotalSupply();
    }

    function _lazyGetFarmed(bytes32 context, uint256 checkpoint) private view returns(uint256) {
        return _contextToInfo(context).ptr.get().farmInfo.farmedSinceCheckpointScaled(checkpoint);
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
