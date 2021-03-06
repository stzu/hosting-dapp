import React, {Component} from 'react';
import {Alert, Button, Col, Collapse, Container, Jumbotron, Row, Table} from 'reactstrap';
import MonthSelector from "../../components/MonthSelector";
import ServiceSelector from "../../components/ServiceSelector";
import Service from "../../contracts/Service.json";
import LabeledInput from '../../components/LabeledInput';

const contract = require('truffle-contract');

/*
    This file contains the Billing view of the web application.
 */

const BillCalculation = (props) => {
    return (
        <Container>
            <Row>
                <Col xs={12} lg={4}><h3>Bill Calculation</h3></Col>
                <Col xs={12} lg={8}>
                    <MonthSelector {...props}/>
                </Col>
            </Row>
            <Table className="table-responsive-sm">
                <thead className="thead-light">
                <tr>
                    <th>Goal</th>
                    <th>Compliance</th>
                    <th>Cost</th>
                    <th>Refund</th>
                    <th>Sum</th>
                </tr>
                </thead>
                <tbody>
                <tr>
                    <td>High</td>
                    <td>{props.info.compliance[2]}%</td>
                    <td>{props.info.cost[2]} {props.currency}</td>
                    <td>{props.info.refund[2]} {props.currency}</td>
                </tr>
                <tr>
                    <td>Middle</td>
                    <td>{props.info.compliance[1]}%</td>
                    <td>{props.info.cost[1]} {props.currency}</td>
                    <td>{props.info.refund[1]} {props.currency}</td>
                </tr>
                <tr>
                    <td>Low</td>
                    <td>{props.info.compliance[0]}%</td>
                    <td>{props.info.cost[0]} {props.currency}</td>
                    <td>{props.info.refund[0]} {props.currency}</td>
                </tr>
                <tr>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td>{props.info.sum} {props.currency}</td>
                </tr>
                </tbody>
            </Table>
        </Container>
    )
};

class Billing extends Component {
    constructor(props) {
        super(props);
        const today = new Date().toISOString().slice(0, 10);
        let contracts = typeof(this.props.serviceContracts) === "object" && this.props.serviceContracts.length > 0 ? this.props.serviceContracts[0] : null;
        this.state = {
            toggle: false,
            selectedService: contracts,
            selectedServiceId: null,
            fromDate: today,
            untilDate: today,
            compliance: [0],
            cost: [0],
            refund: [0],
            sum: 0,
            monitoringDataRaw: "",
            monitoringData: null,
            generatedHash: 0,
            v: 0,
            r: 0,
            s: 0,
            signedBy: 0,
            validated: false,
        };
        this.handleServiceChanged = this.handleServiceChanged.bind(this);
        this.handleDateChanged = this.handleDateChanged.bind(this);
        this.handleBuyWithdrawClicked = this.handleBuyWithdrawClicked.bind(this);
        this.generateHash = this.generateHash.bind(this);
        this.handleHashChanged = this.handleHashChanged.bind(this);
        this.submitMonitoringData = this.submitMonitoringData.bind(this);
        this.toggle = this.toggle.bind(this);
        this.validateMonitoringData = this.validateMonitoringData.bind(this);
    }

    shouldComponentUpdate(nextProps, nextState) {
        // if there are serviceContracts in the nextProps and the state.selectedService is null,
        // set the selected service to the first contract of nextProps
        if (nextProps.serviceContracts.length > 0 && typeof(nextProps.serviceContracts) !== 'string' && this.state.selectedService === null) {
            console.log(nextProps);
            this.setState({
                selectedService: nextProps.serviceContracts[0],
                selectedServiceId: nextProps.serviceContracts[0].id,
                fromDate: nextProps.serviceContracts[0].startDate,
                untilDate: nextProps.serviceContracts[0].endDate,
            }, () => this.calculateComplianceAndCost(
                this.state.fromDate,
                this.state.untilDate,
                this.state.selectedService));
            return true;
        } else if (nextProps.serviceContracts.length > this.props.serviceContracts.length) {
            return true;
        }
        return true;
    }

    calculateComplianceAndCost(fromDate, untilDate, selectedService) {
        const round = (number, precision) => {
            let shift = function (number, precision) {
                let numArray = ("" + number).split("e");
                return +(numArray[0] + "e" + (numArray[1] ? (+numArray[1] + precision) : precision));
            };
            return shift(Math.round(shift(number, +precision)), -precision);
        }; //https://developer.mozilla.org/de/docs/Web/JavaScript/Reference/Global_Objects/Math/round#Eine_Bessere_L%C3%B6sung

        let fromIndex = ((new Date(fromDate)).getTime()
            - (new Date(selectedService.startDate).getTime())) / 86400000;
        let untilIndex = 1 + ((new Date(untilDate)).getTime()
            - (new Date(selectedService.startDate).getTime())) / 86400000;
        console.log("FromIndex: " + fromIndex);
        console.log("UntilIndex: " + untilIndex);
        // console.log(this.state.selectedService.startDate);
        let sla = selectedService.sla;
        //  sla = [_metric, _highGoal, _middleGoal, _refundMiddle, _refundLow];
        let availabilities = selectedService.availability.slice(fromIndex, untilIndex);
        let count = [0, 0, 0]; // low, middle, high
        for (let i = 0; i < availabilities.length; i++) {
            if (availabilities[i] > sla[1]) {
                count[2]++;   // highGoal achieved
            } else if (availabilities[i] > sla[2]) {
                count[1]++;   // middleGoal achieved
            } else {
                count[0]++;  // lowGoal achieved
            }
        }
        let newCompliance = [
            round(100 * count[0] / availabilities.length, 2), // LOW
            round(100 * count[1] / availabilities.length, 2),       // MIDDLE
            round(100 * count[2] / availabilities.length, 2)];  // HIGH
        let newCost = [
            round(count[0] * selectedService.costPerDay * (100 - sla[4]) / 100, 2),
            round(count[1] * selectedService.costPerDay * (100 - sla[3]) / 100, 2),
            round(count[2] * selectedService.costPerDay, 2),
        ];
        let newRefund = [
            round(count[0] * selectedService.costPerDay * sla[4] / 100, 2),
            round(count[1] * selectedService.costPerDay * sla[3] / 100, 2),
            0,
        ];
        let newSum = newCost.reduce((pv, cv) => pv + cv);
        this.setState({
            compliance: newCompliance,
            cost: newCost,
            refund: newRefund,
            sum: newSum,
        })
    }

    handleServiceChanged(e) {
        const id = parseInt(e.target.value, 10);
        //let selectedService = this.props.serviceContracts[id];
        let selectedService = this.props.serviceContracts.find(x => x.id === id);
        this.setState({
            selectedServiceId: id,
            selectedService: selectedService,
        });
        console.log("New ServiceContract selected: " + id);
        this.calculateComplianceAndCost(this.state.fromDate, this.state.untilDate, selectedService);
        //this.props.onChange(id);
    }

    handleDateChanged(e) {
        const newDate = e.target.value;
        switch (e.target.id) {
            case "fromSelector":
                if (newDate > this.state.untilDate) break;
                this.setState({fromDate: newDate});
                this.calculateComplianceAndCost(newDate, this.state.untilDate, this.state.selectedService);
                break;
            case "untilSelector":
                if (newDate < this.state.fromDate) break;
                this.setState({untilDate: newDate});
                this.calculateComplianceAndCost(this.state.fromDate, newDate, this.state.selectedService);
                break;
            default:
                console.log("Error in MonthSelector.handleChange. Target: ");
                console.log(e.target);

        }
        //this.props.onChange(newDate);
        console.log("New " + e.target.id + " date: " + newDate);
        console.log("Date: " + new Date(newDate));
    }

    handleBuyWithdrawClicked(selectedDays) {
        // buy or withdraw?
        let ServiceC = contract(Service);
        ServiceC.setProvider(this.props.web3.currentProvider);
        if (typeof ServiceC.currentProvider.sendAsync !== "function") {
            ServiceC.currentProvider.sendAsync = function () {
                return ServiceC.currentProvider.send.apply(
                    ServiceC.currentProvider, arguments
                );
            };
        }
        let serviceContractInstance = ServiceC.at(this.state.selectedService.hash);
        if (selectedDays > 0) {
            // deposit ether to contract
            this.props.web3.eth.getAccounts((error, accounts) => {
                let transferValue = selectedDays * this.state.selectedService.costPerDay;
                serviceContractInstance.changeContractDuration(selectedDays, {from: accounts[0], value: transferValue})
                    .catch(error => console.log(error)).then(() => console.log("Extended contract."))
            })
        } else if (selectedDays < 0) {
            // Withdraw ether from contract
            this.props.web3.eth.getAccounts((error, accounts) => {
                console.log("Trying to withdraw with account: " + accounts[0]);
                serviceContractInstance.changeContractDuration(selectedDays, {from: accounts[0]})
                    .catch(error => {
                        console.log(error);
                    })
            })
        }
    }

    handleHashChanged(e) {
        switch (e.target.id) {
            case "generatedHash":
                this.setState({generatedHash: e.target.value, validated: false});
                break;
            case "inputV":
                this.setState({v: e.target.value, validated: false});
                break;
            case "inputR":
                this.setState({r: e.target.value, validated: false});
                break;
            case "inputS":
                this.setState({s: e.target.value, validated: false});
                break;
            case "monitoringData":
                this.setState({monitoringDataRaw: e.target.value, validated: false});
                break;
            case "inputSigner":
                this.setState({signedBy: e.target.value, validated: false});
                break;
            default:
                break;
        }
    }

    generateHash() {
        if (this.state.monitoringDataRaw === "") return;
        const monitoringData = this.state.monitoringDataRaw.split(",").map(function (x) {
            return parseInt(x, 10);
        });
        let hash = this.props.web3.utils.soliditySha3({t: 'address', v: this.state.selectedService.hash}, {
            t: 'uint[]',
            v: monitoringData
        });
        console.log(hash);
        //let signedHash = null;
        this.props.web3.eth.getAccounts((error, accounts) => {
            this.props.web3.eth.sign(hash, accounts[0]).then((signedHash) => {
                let r = signedHash.slice(0, 66);
                let s = '0x' + signedHash.slice(66, 130);
                let v = this.props.web3.utils.hexToNumber('0x' + signedHash.slice(130, 132));
                if (v < 2) v = v + 27;
                this.setState({
                    v: v,
                    r: r,
                    s: s,
                    generatedHash: hash,
                    monitoringData: monitoringData,
                    signedBy: accounts[0],
                })
            })
        });
    }

    submitMonitoringData() {
        let ServiceC = contract(Service);
        ServiceC.setProvider(this.props.web3.currentProvider);
        if (typeof ServiceC.currentProvider.sendAsync !== "function") {
            ServiceC.currentProvider.sendAsync = function () {
                return ServiceC.currentProvider.send.apply(
                    ServiceC.currentProvider, arguments
                );
            };
        }
        let serviceContractInstance = ServiceC.at(this.state.selectedService.hash);
        this.props.web3.eth.getAccounts((error, accounts) =>
            serviceContractInstance.addAvailabilityData.estimateGas(this.state.generatedHash, this.state.v,
                this.state.r, this.state.s, this.state.monitoringData, {from: accounts[0]})
                .catch(error => {
                    console.log("ERROR in estimating gas for addAvailabilityData");
                    console.log(error);
                }).then(gasEstimate =>
                serviceContractInstance.addAvailabilityData(this.state.generatedHash, this.state.v,
                    this.state.r, this.state.s, this.state.monitoringData, {from: accounts[0], gas: 2 * gasEstimate})
                    .catch(error => {
                        console.log("ERROR in addAvailabilityData transaction!");
                        console.log(error);
                    })
                    .then(txResult => {
                        console.log("Succesfully added monitoring data to contract.");
                        console.log(txResult);
                    })
            )
        )
        //     function addAvailabilityData(bytes32 h, uint8 v, bytes32 r, bytes32 s, uint[] availabilityData) public {
    }

    validateMonitoringData() {
        if (!this.props.web3.utils.isAddress(this.state.signedBy)) {
            alert("Not a valid address in field: 'Signed by'");
            return;
        }
        let ServiceC = contract(Service);
        ServiceC.setProvider(this.props.web3.currentProvider);
        if (typeof ServiceC.currentProvider.sendAsync !== "function") {
            ServiceC.currentProvider.sendAsync = function () {
                return ServiceC.currentProvider.send.apply(
                    ServiceC.currentProvider, arguments
                );
            };
        }
        let serviceContractInstance = ServiceC.at(this.state.selectedService.hash);
        serviceContractInstance.recoverAddr(this.state.generatedHash, this.state.v, this.state.r, this.state.s)
            .then((address) => {
                console.log("Recoverd address:");
                console.log(address);
                if (address.toLowerCase() === this.state.signedBy.toLowerCase()) {
                    alert("Data is valid.")
                } else {
                    alert("Data is NOT valid!");
                }
            });

        return true;
    }

    toggle() {
        this.setState({collapse: !this.state.collapse});
    }


    render() {
        const rowGrid = {marginBottom: 15 + 'px'};
        let currency = "wei";


        let content = <Container><Alert>Please wait until services have been retrieved...</Alert></Container>;
        if (this.props.serviceContracts === "invalidRequestToGetAllContractsOfCustomer") {
            content = <Container><Alert color="warning">Could not find service contracts for your
                account.</Alert></Container>;
        }
        if (this.state.selectedService !== null) {
            content = <Container>
                <ServiceSelector serviceContracts={this.props.serviceContracts}
                                 selectedService={this.state.selectedService}
                                 onChange={this.handleServiceChanged}
                                 onClick={this.handleBuyWithdrawClicked}
                                 value={this.state.selectedServiceId} currency={currency}/>
                <hr className="my-3"/>
                <BillCalculation selectedService={this.state.selectedService}
                                 fromDate={this.state.fromDate} untilDate={this.state.untilDate}
                                 onDateChanged={this.handleDateChanged}
                                 info={this.state} currency={currency}/>
                <hr className="my-3"/>
                <Container>
                    <Row><Col><Button color="primary" onClick={this.toggle} style={{marginBottom: '1rem'}}>Submit and
                        validate Monitoring data</Button></Col></Row>
                    <Collapse isOpen={this.state.collapse}>
                        <Row>
                            <Col>
                                Please input the monitoring data (separate values with comma)
                            </Col>
                        </Row>
                        <Row>
                            <Col style={rowGrid}>
                                <LabeledInput inputId="monitoringData" type="text" labelText="Monitoring data"
                                              value={this.state.monitoringDataRaw}
                                              onChange={this.handleHashChanged}/>
                            </Col>
                        </Row>
                        <Row style={rowGrid}>
                            <Col xs={8} md={{size: 6, offset: 6}}>
                                <Button id="generateHashBtn" color="primary" className="" block
                                        onClick={this.generateHash}>
                                    Generate signed Hash
                                </Button>
                            </Col>
                        </Row>
                        <Row style={rowGrid}>
                            <Col xs={12}
                                 style={{textAlign: "right", marginBottom: 15 + 'px'}}>
                                <LabeledInput inputId="generatedHash" type="text" labelText={"Hash"}
                                              value={this.state.generatedHash} onChange={this.handleHashChanged}/>
                            </Col>
                            <Col xs={12} style={{textAlign: "right"}}>
                                <LabeledInput inputId="inputV" type="text" labelText={"v"}
                                              value={this.state.v} onChange={this.handleHashChanged}/>
                            </Col>
                            <Col xs={12} style={{textAlign: "right"}}>
                                <LabeledInput inputId="inputR" type="text" labelText={"r"}
                                              value={this.state.r} onChange={this.handleHashChanged}/>
                            </Col>
                            <Col xs={12} style={{textAlign: "right"}}>
                                <LabeledInput inputId="inputS" type="text" labelText={"s"}
                                              value={this.state.s} onChange={this.handleHashChanged}/>
                            </Col>
                            <Col xs={12} style={{textAlign: "right"}}>
                                <LabeledInput inputId="inputSigner" type="text" labelText={"Signed by"}
                                              value={this.state.signedBy} onChange={this.handleHashChanged}/>
                            </Col>
                        </Row>
                        <Row style={rowGrid}>
                            <Col xs={8} md={{size: 5}}>
                                <Button id={"validateMonitoringData"} color={"info"} block
                                        onClick={this.validateMonitoringData}>Validate</Button>
                            </Col>
                            <Col xs={8} md={{size: 6, offset: 1}}>
                                <Button id={"submitMonitoringData"} color={"primary"} block
                                        onClick={this.submitMonitoringData}>Submit to Smart Contract</Button>
                            </Col>
                        </Row>
                    </Collapse>
                </Container>
            </Container>
        }

        return (
            <main>
                <Jumbotron><h1>Billing</h1></Jumbotron>
                {content}
            </main>
        )
    }
}

export default Billing;
