pragma solidity ^0.4.19;

import "./ServiceContract.sol";
import "./Hosting.sol";

contract ServiceBilling is ServiceContract {
    event ContractEndDateUpdated(uint date);

    // Billing
    uint withdrawableForProvider; // service fee that is withdrawable for the provider
    uint lastBillDate = now; // date when the last payout for provider was calculated.
    uint[] availabilityHistory;
    mapping(bytes32 => address) signatures;

    // State channel logic by https://github.com/mattdf/payment-channel/blob/master/channel.sol
    // This function is part of the state channel pattern. Customer, provider and monitoringAgent exchange
    // the service performance data (availabilityData) off-chain to reduce transaction costs. The provider collects
    // the service fee by calling this function once with his signed transaction of the availabilityData and once
    // with the monitoringsAgent's or customer's signed transaction
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

        //emit LogBytes(h);
        //emit LogNumber(v);
        //emit LogBytes(r);
        //emit LogBytes(s);
        //emit LogUintArray(availabilityData);
        //emit LogAddress(signer);

        // check if signer is either provider, customer or monitoringAgent
        require(signer == provider || signer == customer || signer == monitoringAgent || signer2 == provider || signer2 == customer || signer2 == monitoringAgent, "You are not a valid signer!");

        proof = keccak256(abi.encodePacked(address(this), availabilityData));
        //emit LogBytes(proof);

        // hash of contract's address and value equals provided hash h
        require(proof == h, "Provided hash h and calculated proof do not match!");
        //emit Log("proof == h, check");

        if (signatures[proof] == 0) {
            signatures[proof] = signer;
        }
        else if (signatures[proof] != signer) {
            // two out of three individuals accept this monitoring data
            // Append to availabilityHistory, check compliance with SLA and
            // payout provider accordingly (by adding the amount to withdrawableForProvider & update lastBillDate afterwards)
            require(availabilityData.length <= ((now - lastBillDate) / 1 days), "You cannot add performance data for the future!");
            //emit Log("Came this far, only one more call to make.");
            paymentToProvider(availabilityData);
        }
    }

    // Payment for the provider after calculating SLA compliance and possible penalty deductions.
    function paymentToProvider(uint[] availabilityData) public onlyPartners {
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
        emit Log("Added availabilityData to contract");
        emit LogUintArray(availabilityData);
    }

    // This function changes the duration of this contract. When called by a msg with value, the contract is extended.
    // When called without value but a parameter indicating the days to substract from the duration, this function
    // shortens the contract duration and transfers the deposit to the customer
    function changeContractDuration(int _changeDays) public payable {
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
    }

    function terminateContract() public onlyPartners {
        require(endDate < now, "Cannot terminate contract for it's endDate!");
        selfdestruct(customer);
    }

    function withdrawProvider() public onlyProvider {
        // Transfers payout to provider
        msg.sender.transfer(withdrawableForProvider);
        withdrawableForProvider = 0;
    }

    function getAvailabilityHistory() public view onlyPartners returns (uint[]){
        return availabilityHistory;
    }

    function getWithdrawableForProvider() public view onlyProvider returns (uint){
        return withdrawableForProvider;
    }

    function useableCustomerFunds() public view onlyPartners returns (uint){
        return address(this).balance - withdrawableForProvider;
    }
}
