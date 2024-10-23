import React from 'react';
import styled from 'styled-components';
import { Typography, FormControlLabel, Checkbox, Box } from '@mui/material';
import { useActionContext } from '../../context/browserActions';

const CustomBoxContainer = styled.div`
  position: relative;
  min-width: 250px;
  width: auto;
  min-height: 100px;
  height: auto;
  // border: 2px solid #ff00c3;
  border-radius: 5px;
  background-color: white;
  margin: 70px 15px 25px 15px;
`;

const Triangle = styled.div`
  position: absolute;
  top: -15px;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 20px solid transparent;
  border-right: 20px solid transparent;
  border-bottom: 20px solid white;
`;

const Logo = styled.img`
  position: absolute;
  top: -70px;
  left: 50%;
  transform: translateX(-50%);
  width: 60px;
  height: auto;
  border-radius: 5px;
`;

const Content = styled.div`
  padding: 20px;
  text-align: left;
`;

const ActionDescriptionBox = () => {
  const { getText, getScreenshot, getList, captureStage } = useActionContext();

  const messages = [
    { stage: 'initial' as const, text: 'Select the list you want to extract along with the texts inside it' },
    { stage: 'pagination' as const, text: 'Select how the robot can capture the rest of the list' },
    { stage: 'limit' as const, text: 'Choose the number of items to extract' },
    { stage: 'complete' as const, text: 'Capture is complete' },
  ];

  const renderActionDescription = () => {
    if (getText) {
      return (
        <>
          <Typography variant="subtitle2" gutterBottom>Capture Text</Typography>
          <Typography variant="body2" gutterBottom>Hover over the texts you want to extract and click to select them</Typography>
        </>
      );
    } else if (getScreenshot) {
      return (
        <>
          <Typography variant="subtitle2" gutterBottom>Capture Screenshot</Typography>
          <Typography variant="body2" gutterBottom>Capture a partial or full page screenshot of the current page.</Typography>
        </>
      );
    } else if (getList) {
      return (
        <>
          <Typography variant="subtitle2" gutterBottom>Capture List</Typography>
          <Typography variant="body2" gutterBottom>
            Hover over the list you want to extract. Once selected, you can hover over all texts inside the list you selected. Click to select them.
          </Typography>
          <Box>
            {messages.map(({ stage, text }) => (
              <FormControlLabel
                key={stage}
                control={
                  <Checkbox
                    checked={
                      (stage === 'initial' && captureStage !== '') ||
                      (stage === 'pagination' && (captureStage === 'pagination' || captureStage === 'limit' || captureStage === 'complete')) ||
                      (stage === 'limit' && (captureStage === 'limit' || captureStage === 'complete')) ||
                      (stage === 'complete' && captureStage === 'complete')
                    }
                    disabled
                  />
                }
                label={<Typography variant="body2" gutterBottom>{text}</Typography>}
              />
            ))}
          </Box>
        </>
      );
    } else {
      return (
        <>
          <Typography variant="subtitle2" gutterBottom>What data do you want to extract?</Typography>
          <Typography variant="body2" gutterBottom>A robot is designed to perform one action at a time. You can choose any of the options below.</Typography>
        </>
      );
    }
  };

  return (
    <CustomBoxContainer>
      <Logo src="https://ik.imagekit.io/9owqhz0po/Screenshot%202024-10-20%20232710.png" alt="Logo" />
      <Triangle />
      <Content>
        {renderActionDescription()}
      </Content>
    </CustomBoxContainer>
  );
};

export default ActionDescriptionBox;
