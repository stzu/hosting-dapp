pragma solidity ^0.4.19;

import "./ServiceDatabase.sol";

/*
    This file contains the ServiceLogic smart contract. It provides the business logic for the Service smart
    contract, such as the functionality for the state channel / oracle, compliance checking of the SLA and the
    calculation of reimbursements. It also includes the withdrawal-pattern to allow the service provider to collect
    its service fee.
*/


contract ServiceLogic is ServiceDatabase {
    /*
     State channel logic by https://github.com/mattdf/payment-channel/blob/master/channel.sol
     This function is part of the state channel pattern. Customer, provider and monitoringAgent exchange
     the service performance data (availabilityData) off-chain to reduce transaction costs. The provider collects
     the service fee by calling this function once with his signed transaction of the availabilityData and once
     with the monitoringsAgent's or customer's signed transaction
    */
    function addAvailabilityData(bytes32 h, uint8 v, bytes32 r, bytes32 s, uint[] availabilityData) public {
        address signer;
        bytes32 proof;

        // do this for testing because truffle's web 3 is different to MetaMask's web3
        bytes memory prefix = "\x19Ethereum Signed Message:\n32";
        bytes32 prefixedHash = keccak256(abi.encodePacked(prefix, h));
        address signer2 = ecrecover(prefixedHash, v, r, s);

        // now this is for prod with MetaMask:
        // get who signed hash of (contract_address, values)
        signer = ecrecover(h, v, r, s);

        // check if signer is either provider, customer or monitoringAgent
        require(signer == provider || signer == customer || signer == monitoringAgent || signer2 == provider || signer2 == customer || signer2 == monitoringAgent, "You are not a valid signer!");

        proof = keccak256(abi.encodePacked(address(this), availabilityData));

        // hash of contract's address and value equals provided hash h
        require(proof == h, "Provided hash h and calculated proof do not match!");

        if (signatures[proof] == 0) {
            signatures[proof] = signer;
        }
        else if (signatures[proof] != signer) {
            // two out of three individuals accept this monitoring data
            // Append to availabilityHistory, check compliance with SLA and
            // payout provider accordingly (by adding the amount to withdrawableForProvider & update lastBillDate afterwards)
            require(availabilityData.length <= ((now - lastBillDate) / 1 days), "You cannot add performance data for the future!");
            paymentToProvider(availabilityData);
        }
    }

    // Payment for the provider after calculating SLA compliance and possible penalty deductions.
    function paymentToProvider(uint[] availabilityData) internal {
        uint availability;
        uint providerPenalty = 100;

        // calculate the SLA compliance and penalty per day
        for (uint i = 1; i <= availabilityData.length; i++) {
            availability = availabilityData[i - 1];
            providerPenalty = (providerPenalty * (i - 1) + calculatePenalty(availability)) / i;
            availabilityHistory.push(availabilityData[i - 1]);
        }

        // Calculate the service fee for provider according to the performance per day and SLA penalties
        uint earningsProviderSinceLastUpdate = costPerDay * availabilityData.length * providerPenalty / 100;
        withdrawableForProvider += earningsProviderSinceLastUpdate;
        // use withdrawable pattern for provider

        lastBillDate += 1 days * availabilityData.length;
        emit WithdrawalForProviderChanged(withdrawableForProvider);
    }

    // helper function that checks the SLOs of the SLA
    function calculatePenalty(uint _achievedServiceQuality) public view returns (uint){
        require(slaSet, "SLA has not been set yet, cannot calculate quality");
        uint penalty = sla[4];
        //default: set penalty to refundLow (achieved 0% - middleGoal)
        if (_achievedServiceQuality >= sla[2]) penalty = sla[3];
        //set penalty to refundMiddle (achieved middleGoal - highGoal)
        if (_achievedServiceQuality >= sla[1]) penalty = 0;
        // SLA was adhered to -> no penalty
        return penalty;
    }


    // This function changes the duration of this contract. When called by a msg with value, the contract is extended.
    // When called without value but a parameter indicating the days to substract from the duration, this function
    // shortens the contract duration and transfers the deposit to the customer
    function changeContractDuration(int _changeDays) public payable returns (uint) {
        //if(_changeDays > 0 && msg.value < costPerDay) return;
        // Check if contract get's extended or shortened
        if (_changeDays > 0) {
            // extend the contract
            require(msg.value >= costPerDay, "Payable > costPerDay is required to extend at least by a day!");
            uint extendableDays = msg.value / costPerDay;
            endDate += extendableDays * 1 days;
            if (!isActive && endDate > now) setActive(true);
        } else {
            // shorten the contract
            // check if someone's trying to shorten the contract into the past
            uint changeDays = uint(- 1 * _changeDays);
            require(endDate - (changeDays * 1 days) > (now + 1 days), "Can shorten contract only till tomorrow!");
            // transfer funds back to customer
            uint reimbursement = changeDays * costPerDay;
            endDate = endDate - changeDays * 1 days;
            customer.transfer(reimbursement);
        }
        emit ContractEndDateUpdated(endDate);
        return endDate;
    }

    function terminateContract() public onlyPartners {
        require(endDate < now, "Cannot terminate contract before its endDate!");
        selfdestruct(customer);
    }

    // function that allows the provider to withdraw its service fee
    function withdrawProvider() public onlyProvider {
        // Transfers payout to provider
        msg.sender.transfer(withdrawableForProvider);
        withdrawableForProvider = 0;
    }

    function setActive(bool _state) internal {
        if (isActive != _state) emit ContractStateChanged(_state);
        isActive = _state;
    }
}
